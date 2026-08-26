# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import re
from datetime import datetime, timezone
from fastapi import Depends
from sqlalchemy import func, select, update, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.common.base_repository import BaseRepository
from src.common.schema.media_item_model import MediaItem
from src.database import get_db
from src.folders.dto.folder_dto import (
    FolderBreadcrumbDto,
    FolderResponseDto,
    FolderTreeNodeDto,
)
from src.folders.schema.folder_model import Folder, FolderModel
from src.source_assets.schema.source_asset_model import SourceAsset


def generate_disambiguated_name(
    base_name: str, existing_names_lower: set[str]
) -> str:
    """Generates a non-colliding name by appending ' (N)'."""
    base = base_name.strip()
    if base.lower() not in existing_names_lower:
        return base

    match = re.search(r"^(.*?)\s+\((\d+)\)$", base)
    if match:
        root_name = match.group(1).strip()
        current_num = int(match.group(2))
    else:
        root_name = base
        current_num = 0

    current_idx = current_num + 1 if current_num > 0 else 1
    while True:
        candidate = f"{root_name} ({current_idx})"
        if candidate.lower() not in existing_names_lower:
            return candidate
        current_idx += 1


class FolderRepository(BaseRepository[Folder, FolderModel]):
    """Handles database queries for folders and folder hierarchies."""

    def __init__(self, db: AsyncSession = Depends(get_db)):
        super().__init__(model=Folder, schema=FolderModel, db=db)

    async def is_folder_name_taken(
        self,
        workspace_id: int,
        parent_id: int | None,
        name: str,
        exclude_folder_id: int | None = None,
    ) -> bool:
        """Check if an active folder with the given name exists under the specified parent."""
        clean_name = name.strip()
        query = select(self.model.id).where(
            self.model.workspace_id == workspace_id,
            func.lower(func.trim(self.model.name)) == clean_name.lower(),
            self.model.deleted_at.is_(None),
        )
        if parent_id is None:
            query = query.where(self.model.parent_id.is_(None))
        else:
            query = query.where(self.model.parent_id == parent_id)

        if exclude_folder_id is not None:
            query = query.where(self.model.id != exclude_folder_id)

        result = await self.db.execute(query)
        return result.first() is not None

    async def get_existing_folder_names(
        self,
        workspace_id: int,
        parent_id: int | None,
        exclude_folder_id: int | None = None,
    ) -> set[str]:
        """Fetch set of lowercase trimmed names of all active sibling folders."""
        query = select(func.lower(func.trim(self.model.name))).where(
            self.model.workspace_id == workspace_id,
            self.model.deleted_at.is_(None),
        )
        if parent_id is None:
            query = query.where(self.model.parent_id.is_(None))
        else:
            query = query.where(self.model.parent_id == parent_id)

        if exclude_folder_id is not None:
            query = query.where(self.model.id != exclude_folder_id)

        result = await self.db.execute(query)
        return {row[0] for row in result.fetchall()}

    async def get_unique_folder_name(
        self,
        workspace_id: int,
        parent_id: int | None,
        base_name: str,
        exclude_folder_id: int | None = None,
    ) -> str:
        """Calculates a unique disambiguated name for a folder within its destination."""
        existing_names = await self.get_existing_folder_names(
            workspace_id=workspace_id,
            parent_id=parent_id,
            exclude_folder_id=exclude_folder_id,
        )
        return generate_disambiguated_name(base_name, existing_names)

    async def get_folder_by_id(
        self, folder_id: int, include_deleted: bool = False
    ) -> Folder | None:
        """Fetch single folder by primary key."""
        query = select(self.model).where(self.model.id == folder_id)
        if not include_deleted:
            query = query.where(self.model.deleted_at.is_(None))
        result = await self.db.execute(query)
        return result.scalars().first()

    async def list_by_parent(
        self, workspace_id: int, parent_id: int | None = None
    ) -> list[FolderResponseDto]:
        """List immediate child folders in a workspace, including aggregated item & subfolder counts."""
        # Subquery for media_items count per folder
        media_count_sq = (
            select(
                MediaItem.folder_id,
                func.count(MediaItem.id).label("media_count"),
            )
            .where(
                MediaItem.workspace_id == workspace_id,
                MediaItem.deleted_at.is_(None),
                MediaItem.folder_id.is_not(None),
            )
            .group_by(MediaItem.folder_id)
            .subquery()
        )

        # Subquery for source_assets count per folder
        asset_count_sq = (
            select(
                SourceAsset.folder_id,
                func.count(SourceAsset.id).label("asset_count"),
            )
            .where(
                SourceAsset.workspace_id == workspace_id,
                SourceAsset.deleted_at.is_(None),
                SourceAsset.folder_id.is_not(None),
            )
            .group_by(SourceAsset.folder_id)
            .subquery()
        )

        # Subquery for direct subfolder count per folder
        subfolder_count_sq = (
            select(
                Folder.parent_id.label("parent_id"),
                func.count(Folder.id).label("subfolder_count"),
            )
            .where(
                Folder.workspace_id == workspace_id,
                Folder.deleted_at.is_(None),
                Folder.parent_id.is_not(None),
            )
            .group_by(Folder.parent_id)
            .subquery()
        )

        query = (
            select(
                self.model,
                func.coalesce(media_count_sq.c.media_count, 0).label(
                    "media_count"
                ),
                func.coalesce(asset_count_sq.c.asset_count, 0).label(
                    "asset_count"
                ),
                func.coalesce(subfolder_count_sq.c.subfolder_count, 0).label(
                    "subfolder_count"
                ),
            )
            .outerjoin(
                media_count_sq, self.model.id == media_count_sq.c.folder_id
            )
            .outerjoin(
                asset_count_sq, self.model.id == asset_count_sq.c.folder_id
            )
            .outerjoin(
                subfolder_count_sq,
                self.model.id == subfolder_count_sq.c.parent_id,
            )
            .where(
                self.model.workspace_id == workspace_id,
                self.model.deleted_at.is_(None),
            )
        )

        if parent_id is None:
            query = query.where(self.model.parent_id.is_(None))
        else:
            query = query.where(self.model.parent_id == parent_id)

        query = query.order_by(self.model.name.asc())
        result = await self.db.execute(query)

        folders_list: list[FolderResponseDto] = []
        for row in result.all():
            folder_obj = row[0]
            media_count = row[1]
            asset_count = row[2]
            subfolder_count = row[3]
            folders_list.append(
                FolderResponseDto(
                    id=folder_obj.id,
                    workspace_id=folder_obj.workspace_id,
                    user_id=folder_obj.user_id,
                    user_email=folder_obj.user_email,
                    name=folder_obj.name,
                    parent_id=folder_obj.parent_id,
                    color=folder_obj.color,
                    item_count=media_count + asset_count,
                    subfolder_count=subfolder_count,
                    created_at=folder_obj.created_at,
                    updated_at=folder_obj.updated_at,
                )
            )

        return folders_list

    async def get_breadcrumbs(
        self, folder_id: int
    ) -> list[FolderBreadcrumbDto]:
        """Fetch ancestor hierarchy from root to current folder using recursive CTE."""
        cte_query = text(
            """
            WITH RECURSIVE breadcrumbs AS (
                SELECT id, name, parent_id, 1 AS depth
                FROM folders
                WHERE id = :folder_id AND deleted_at IS NULL
                UNION ALL
                SELECT f.id, f.name, f.parent_id, b.depth + 1
                FROM folders f
                JOIN breadcrumbs b ON f.id = b.parent_id
                WHERE f.deleted_at IS NULL
            )
            SELECT id, name, parent_id FROM breadcrumbs ORDER BY depth DESC;
            """
        )
        result = await self.db.execute(cte_query, {"folder_id": folder_id})
        rows = result.fetchall()
        return [
            FolderBreadcrumbDto(
                id=row.id, name=row.name, parent_id=row.parent_id
            )
            for row in rows
        ]

    async def get_descendant_ids(self, folder_id: int) -> list[int]:
        """Fetch all descendant folder IDs (subfolders, sub-subfolders, etc.) using recursive CTE."""
        cte_query = text(
            """
            WITH RECURSIVE descendants AS (
                SELECT id FROM folders WHERE id = :folder_id AND deleted_at IS NULL
                UNION ALL
                SELECT f.id FROM folders f
                JOIN descendants d ON f.parent_id = d.id
                WHERE f.deleted_at IS NULL
            )
            SELECT id FROM descendants;
            """
        )
        result = await self.db.execute(cte_query, {"folder_id": folder_id})
        return [row.id for row in result.fetchall()]

    async def get_tree(self, workspace_id: int) -> list[FolderTreeNodeDto]:
        """Fetch full folder hierarchy tree for a workspace."""
        query = (
            select(self.model)
            .where(
                self.model.workspace_id == workspace_id,
                self.model.deleted_at.is_(None),
            )
            .order_by(self.model.name.asc())
        )
        result = await self.db.execute(query)
        all_folders = result.scalars().all()

        # Build tree in memory
        nodes_by_id: dict[int, FolderTreeNodeDto] = {}
        for f in all_folders:
            nodes_by_id[f.id] = FolderTreeNodeDto(
                id=f.id,
                name=f.name,
                parent_id=f.parent_id,
                color=f.color,
                children=[],
            )

        root_nodes: list[FolderTreeNodeDto] = []
        for f in all_folders:
            node = nodes_by_id[f.id]
            if f.parent_id and f.parent_id in nodes_by_id:
                nodes_by_id[f.parent_id].children.append(node)
            else:
                root_nodes.append(node)

        return root_nodes

    async def soft_delete(
        self, folder_id: int, user_id: int | None = None
    ) -> bool:
        """Soft deletes a folder and all its descendant subfolders."""
        descendant_ids = await self.get_descendant_ids(folder_id)
        if not descendant_ids:
            return False

        now = datetime.now(timezone.utc)
        stmt = (
            update(self.model)
            .where(self.model.id.in_(descendant_ids))
            .values(deleted_at=now, deleted_by=user_id)
        )
        await self.db.execute(stmt)
        await self.db.commit()
        return True

    async def move_media_items(
        self,
        media_item_ids: list[int],
        workspace_id: int,
        destination_folder_id: int | None,
    ) -> int:
        """Move multiple media items to a destination folder."""
        if not media_item_ids:
            return 0
        stmt = (
            update(MediaItem)
            .where(
                MediaItem.id.in_(media_item_ids),
                MediaItem.workspace_id == workspace_id,
            )
            .values(folder_id=destination_folder_id)
        )
        result = await self.db.execute(stmt)
        await self.db.commit()
        return result.rowcount

    async def move_source_assets(
        self,
        source_asset_ids: list[int],
        workspace_id: int,
        destination_folder_id: int | None,
    ) -> int:
        """Move multiple source assets to a destination folder."""
        if not source_asset_ids:
            return 0
        stmt = (
            update(SourceAsset)
            .where(
                SourceAsset.id.in_(source_asset_ids),
                SourceAsset.workspace_id == workspace_id,
            )
            .values(folder_id=destination_folder_id)
        )
        result = await self.db.execute(stmt)
        await self.db.commit()
        return result.rowcount

    async def move_folders(
        self,
        folder_ids: list[int],
        workspace_id: int,
        destination_folder_id: int | None,
    ) -> int:
        """Move multiple folders to a destination parent folder with automatic name disambiguation."""
        if not folder_ids:
            return 0

        # Query all folders to move
        query = select(self.model).where(
            self.model.id.in_(folder_ids),
            self.model.workspace_id == workspace_id,
            self.model.deleted_at.is_(None),
        )
        result = await self.db.execute(query)
        folders = result.scalars().all()
        if not folders:
            return 0

        # Fetch existing sibling names in destination
        existing_names = await self.get_existing_folder_names(
            workspace_id=workspace_id,
            parent_id=destination_folder_id,
        )
        for f in folders:
            if f.parent_id == destination_folder_id:
                existing_names.discard(f.name.strip().lower())

        moved_count = 0
        for f in folders:
            if f.parent_id != destination_folder_id:
                new_name = generate_disambiguated_name(f.name, existing_names)
                f.name = new_name
                f.parent_id = destination_folder_id
                existing_names.add(new_name.strip().lower())
                moved_count += 1

        await self.db.commit()
        return moved_count

    async def move_folder_to_workspace(
        self, folder_id: int, target_workspace_id: int
    ) -> dict[str, int]:
        """Moves a folder hierarchy and all contained media items and source assets to a target workspace with root name disambiguation."""
        root_folder = await self.get_folder_by_id(folder_id)
        if not root_folder:
            return {"folders_moved": 0, "media_moved": 0, "assets_moved": 0}

        descendant_ids = await self.get_descendant_ids(folder_id)
        if not descendant_ids:
            return {"folders_moved": 0, "media_moved": 0, "assets_moved": 0}

        # Check for name collision at root level of target workspace
        existing_root_names = await self.get_existing_folder_names(
            workspace_id=target_workspace_id,
            parent_id=None,
        )
        disambiguated_name = generate_disambiguated_name(
            root_folder.name, existing_root_names
        )

        # 1. Update media items belonging to any folder in the subtree
        media_stmt = (
            update(MediaItem)
            .where(MediaItem.folder_id.in_(descendant_ids))
            .values(workspace_id=target_workspace_id)
        )
        media_res = await self.db.execute(media_stmt)

        # 2. Update source assets belonging to any folder in the subtree
        asset_stmt = (
            update(SourceAsset)
            .where(SourceAsset.folder_id.in_(descendant_ids))
            .values(workspace_id=target_workspace_id)
        )
        asset_res = await self.db.execute(asset_stmt)

        # 3. Update descendant child folders (excluding the root folder being moved)
        child_folder_ids = [fid for fid in descendant_ids if fid != folder_id]
        if child_folder_ids:
            child_folders_stmt = (
                update(Folder)
                .where(
                    Folder.id.in_(child_folder_ids),
                    Folder.deleted_at.is_(None),
                )
                .values(workspace_id=target_workspace_id)
            )
            await self.db.execute(child_folders_stmt)

        # 4. Update the root folder being moved: set workspace_id, reset parent_id to None, and apply disambiguated name
        root_folder_stmt = (
            update(Folder)
            .where(
                Folder.id == folder_id,
                Folder.deleted_at.is_(None),
            )
            .values(
                workspace_id=target_workspace_id,
                parent_id=None,
                name=disambiguated_name,
            )
        )
        await self.db.execute(root_folder_stmt)

        await self.db.commit()

        return {
            "folders_moved": len(descendant_ids),
            "media_moved": media_res.rowcount,
            "assets_moved": asset_res.rowcount,
        }
