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

import {ComponentFixture, TestBed} from '@angular/core/testing';
import {MatDividerModule} from '@angular/material/divider';
import {MatIconModule} from '@angular/material/icon';
import {MatMenuModule} from '@angular/material/menu';

import {FolderCardComponent} from './folder-card.component';

describe('FolderCardComponent', () => {
  let component: FolderCardComponent;
  let fixture: ComponentFixture<FolderCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [FolderCardComponent],
      imports: [MatIconModule, MatMenuModule, MatDividerModule],
    }).compileComponents();

    fixture = TestBed.createComponent(FolderCardComponent);
    component = fixture.componentInstance;
    component.folder = {
      id: 1,
      workspaceId: 1,
      userEmail: 'test@example.com',
      name: 'Test Folder',
      itemCount: 3,
      subfolderCount: 1,
      color: '#8AB4F8',
    };
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should compute folderName and totalCount correctly', () => {
    expect(component.folderName).toBe('Test Folder');
    expect(component.totalCount).toBe(4);
    expect(component.folderColor).toBe('#8AB4F8');
  });

  it('should emit folderClicked when card is clicked in normal mode', () => {
    spyOn(component.folderClicked, 'emit');
    const event = new MouseEvent('click');
    component.onCardClick(event);
    expect(component.folderClicked.emit).toHaveBeenCalledWith(component.folder);
  });
});
