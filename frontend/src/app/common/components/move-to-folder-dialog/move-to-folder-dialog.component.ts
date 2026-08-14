/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {Component, Inject, OnInit} from '@angular/core';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog';
import {FolderTreeNode} from '../../models/folder.model';
import {FolderService} from '../../services/folder.service';

export interface MoveToFolderDialogData {
  workspaceId: number;
  itemCount: number;
  movingFolderIds?: number[];
  currentFolderId?: number | null;
}

export interface FlattenedFolderOption {
  id: number | null; // null = Root
  name: string;
  depth: number;
  color?: string | null;
  disabled: boolean;
}

@Component({
  selector: 'app-move-to-folder-dialog',
  templateUrl: './move-to-folder-dialog.component.html',
  styleUrls: ['./move-to-folder-dialog.component.scss'],
})
export class MoveToFolderDialogComponent implements OnInit {
  folderOptions: FlattenedFolderOption[] = [];
  selectedDestinationId: number | null = null;
  isLoading = true;
  searchQuery = '';

  constructor(
    public dialogRef: MatDialogRef<MoveToFolderDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: MoveToFolderDialogData,
    private folderService: FolderService,
  ) {}

  ngOnInit(): void {
    this.loadFolders();
  }

  loadFolders(): void {
    this.isLoading = true;
    this.folderService.getFolderTree(this.data.workspaceId).subscribe({
      next: tree => {
        const options: FlattenedFolderOption[] = [];
        // Add Root option
        const isCurrentRoot = this.data.currentFolderId === null;
        options.push({
          id: null,
          name: 'Gallery Root (Top Level)',
          depth: 0,
          color: '#8AB4F8',
          disabled: isCurrentRoot,
        });

        // Flatten the tree into indented rows
        const disabledIds = new Set<number>(this.data.movingFolderIds || []);
        // If there are any moving folders, we need to disable their ancestors as well.
        // Because we can't move folders into their own children.
        const isMovingFolders = (this.data.movingFolderIds?.length ?? 0) > 0;

        const traverse = (
          nodes: FolderTreeNode[],
          depth: number,
          parentDisabled: boolean,
        ) => {
          for (const node of nodes) {
            const isSelfMoving = disabledIds.has(node.id);
            const isDisabled =
              parentDisabled ||
              isSelfMoving ||
              this.data.currentFolderId === node.id;

            options.push({
              id: node.id,
              name: node.name,
              depth,
              color: node.color,
              disabled: isDisabled,
            });

            if (node.children && node.children.length > 0) {
              traverse(node.children, depth + 1, isMovingFolders && isDisabled);
            }
          }
        };

        traverse(tree, 1, false);
        this.folderOptions = options;
        this.isLoading = false;
      },
      error: err => {
        console.error('Failed to load folder tree', err);
        this.isLoading = false;
      },
    });
  }

  get filteredOptions(): FlattenedFolderOption[] {
    if (!this.searchQuery.trim()) {
      return this.folderOptions;
    }
    const q = this.searchQuery.toLowerCase();
    return this.folderOptions.filter(opt => opt.name.toLowerCase().includes(q));
  }

  selectOption(opt: FlattenedFolderOption): void {
    if (opt.disabled) {
      return;
    }
    this.selectedDestinationId = opt.id;
  }

  confirm(): void {
    const selectedOption = this.folderOptions.find(
      f => f.id === this.selectedDestinationId,
    );
    this.dialogRef.close({
      destinationFolderId: this.selectedDestinationId,
      folderName: selectedOption?.name,
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}
