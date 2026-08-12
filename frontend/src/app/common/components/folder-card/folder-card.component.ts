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

import {Component, EventEmitter, Input, Output, ViewChild} from '@angular/core';
import {MatMenuTrigger} from '@angular/material/menu';
import {Folder} from '../../models/folder.model';

@Component({
  selector: 'app-folder-card',
  templateUrl: './folder-card.component.html',
  styleUrl: './folder-card.component.scss',
})
export class FolderCardComponent {
  @Input() folder!: Folder;
  @Input() isSelectionMode = false;
  @Input() isSelected = false;

  @Output() folderClicked = new EventEmitter<Folder>();
  @Output() editRequested = new EventEmitter<Folder>();
  @Output() deleteRequested = new EventEmitter<Folder>();
  @Output() moveRequested = new EventEmitter<Folder>();
  @Output() selectionToggled = new EventEmitter<{
    folder: Folder;
    event: MouseEvent;
  }>();

  @ViewChild('menuTrigger') menuTrigger!: MatMenuTrigger;

  get folderName(): string {
    return this.folder?.name || 'Untitled Folder';
  }

  get totalCount(): number {
    return (this.folder?.itemCount || 0) + (this.folder?.subfolderCount || 0);
  }

  get folderColor(): string {
    return this.folder?.color || '#8AB4F8';
  }

  onCardClick(event: MouseEvent): void {
    if (this.isSelectionMode) {
      this.selectionToggled.emit({folder: this.folder, event});
    } else {
      this.folderClicked.emit(this.folder);
    }
  }

  onMenuClick(event: MouseEvent): void {
    event.stopPropagation();
  }

  onEdit(event: MouseEvent): void {
    event.stopPropagation();
    this.menuTrigger.closeMenu();
    this.editRequested.emit(this.folder);
  }

  onMove(event: MouseEvent): void {
    event.stopPropagation();
    this.menuTrigger.closeMenu();
    this.moveRequested.emit(this.folder);
  }

  onDelete(event: MouseEvent): void {
    event.stopPropagation();
    this.menuTrigger.closeMenu();
    this.deleteRequested.emit(this.folder);
  }
}
