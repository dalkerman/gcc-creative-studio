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
import {HttpClientTestingModule} from '@angular/common/http/testing';
import {ElementRef, NO_ERRORS_SCHEMA} from '@angular/core';
import {DomSanitizer} from '@angular/platform-browser';
import {MatIconModule} from '@angular/material/icon';
import {MatMenuModule} from '@angular/material/menu';
import {NoopAnimationsModule} from '@angular/platform-browser/animations';
import {of} from 'rxjs';
import {MediaGalleryComponent} from './media-gallery.component';
import {GalleryService} from '../gallery.service';
import {UserService} from '../../common/services/user.service';
import {WorkspaceStateService} from '../../services/workspace/workspace-state.service';
import {TagsService} from '../../common/services/tags.service';
import {MediaUploadService} from '../../common/services/media-upload/media-upload.service';
import {GoogleDriveService} from '../../common/services/google-drive/google-drive.service';
import {FolderService} from '../../common/services/folder.service';
import {MatSnackBar} from '@angular/material/snack-bar';

describe('MediaGalleryComponent', () => {
  let component: MediaGalleryComponent;
  let fixture: ComponentFixture<MediaGalleryComponent>;
  let uploadService: MediaUploadService;
  let folderService: jasmine.SpyObj<FolderService>;
  let galleryService: GalleryService;

  beforeEach(async () => {
    const folderServiceSpy = jasmine.createSpyObj('FolderService', [
      'getFolders',
      'getBreadcrumbs',
      'moveItems',
      'createFolder',
      'updateFolder',
      'deleteFolder',
    ]);
    folderServiceSpy.getFolders.and.returnValue(of([]));
    folderServiceSpy.getBreadcrumbs.and.returnValue(of([]));
    folderServiceSpy.moveItems.and.returnValue(of({total_moved: 1}));

    await TestBed.configureTestingModule({
      declarations: [MediaGalleryComponent],
      imports: [
        HttpClientTestingModule,
        MatIconModule,
        MatMenuModule,
        NoopAnimationsModule,
      ],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        MediaUploadService,
        {
          provide: FolderService,
          useValue: folderServiceSpy,
        },
        {
          provide: MatSnackBar,
          useValue: {
            open: jasmine.createSpy('open'),
          },
        },
        {
          provide: GoogleDriveService,
          useValue: {
            openPicker: () => of([]),
          },
        },
        {
          provide: GalleryService,
          useValue: {
            isLoading$: of(false),
            images$: of([]),
            allImagesLoaded: of(true),
            searchTerm: () => {},
            filtersState: null,
            setFiltersState: () => {},
            setFilters: () => {},
            bulkDelete: () => of({deleted_count: 1}),
            bulkDownload: () => of(new Blob()),
            bulkCopy: () => of({}),
            bulkMove: () => of({moved_count: 1}),
          },
        },
        {
          provide: DomSanitizer,
          useValue: {
            bypassSecurityTrustResourceUrl: (url: string) => url,
            bypassSecurityTrustUrl: (url: string) => url,
            sanitize: (context: unknown, value: unknown) => value,
          },
        },
        {
          provide: UserService,
          useValue: {
            getUserDetails: () => ({
              email: 'test@google.com',
              roles: ['ADMIN'],
            }),
          },
        },
        {
          provide: WorkspaceStateService,
          useValue: {
            activeWorkspaceId$: of(1),
            getActiveWorkspaceId: () => 1,
          },
        },
        {
          provide: TagsService,
          useValue: {
            getTags: () => of({data: []}),
            deleteTag: () => of(null),
            bulkAssign: () => of(null),
          },
        },
        {
          provide: ElementRef,
          useValue: {nativeElement: {querySelectorAll: () => []}},
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MediaGalleryComponent);
    component = fixture.componentInstance;
    uploadService = TestBed.inject(MediaUploadService);
    folderService = TestBed.inject(
      FolderService,
    ) as jasmine.SpyObj<FolderService>;
    galleryService = TestBed.inject(GalleryService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should trigger MediaUploadService.uploadFiles when files are selected', () => {
    spyOn(uploadService, 'uploadFiles');

    const dummyFile = new File(['test'], 'demo.png', {type: 'image/png'});
    const mockEvent = {
      target: {
        files: [dummyFile],
        value: 'demo.png',
      },
    } as unknown as Event;

    component.onFilesSelected(mockEvent);
    expect(uploadService.uploadFiles).toHaveBeenCalledWith(1, [dummyFile]);
  });

  it('should trigger MediaUploadService.uploadFiles when files are selected from Google Drive', () => {
    const driveService = TestBed.inject(GoogleDriveService);
    const dummyFile = new File(['test'], 'drive-demo.png', {type: 'image/png'});
    spyOn(driveService, 'openPicker').and.returnValue(of([dummyFile]));
    spyOn(uploadService, 'uploadFiles');

    component.openGoogleDrivePicker();
    expect(driveService.openPicker).toHaveBeenCalled();
    expect(uploadService.uploadFiles).toHaveBeenCalledWith(1, [dummyFile]);
  });

  describe('ngOnInit filters restoration', () => {
    it('should restore filters from GalleryService on init', () => {
      const mockState = {
        query: 'test query',
        mimeType: 'image/*',
        model: 'test-model',
        itemType: 'media_item',
        tags: ['tag1', 'tag2'],
        onlyMyMedia: true,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-01-02T00:00:00.000Z'),
      };

      const galleryService = TestBed.inject(GalleryService);
      (galleryService as unknown as {filtersState: unknown}).filtersState =
        mockState;

      component.ngOnInit();

      expect(component.queryFilter).toBe('test query');
      expect(component.mediaTypeFilter).toBe('image/*');
      expect(component.generationModelFilter).toBe('test-model');
      expect(component.assetTypeFilter).toBe('media_item');
      expect(component.tagsFilter).toEqual(['tag1', 'tag2']);
      expect(component.onlyMyMedia).toBeTrue();
      expect(component.startDateFilter).toEqual(
        new Date('2026-01-01T00:00:00.000Z'),
      );
      expect(component.endDateFilter).toEqual(
        new Date('2026-01-02T00:00:00.000Z'),
      );
    });

    it('should use default values when no filtersState is stored', () => {
      const galleryService = TestBed.inject(GalleryService);
      (galleryService as unknown as {filtersState: unknown}).filtersState =
        null;

      component.ngOnInit();

      expect(component.queryFilter).toBe('');
      expect(component.mediaTypeFilter).toBe('');
      expect(component.generationModelFilter).toBe('');
      expect(component.assetTypeFilter).toBe('');
      expect(component.tagsFilter).toEqual([]);
      expect(component.onlyMyMedia).toBeFalse();
      expect(component.startDateFilter).toBeNull();
      expect(component.endDateFilter).toBeNull();
    });
  });

  describe('Drag and Drop moving', () => {
    it('should move items to a target folder on onItemDroppedOnFolder', () => {
      const targetFolder = {
        id: 5,
        workspaceId: 1,
        userEmail: 'test@google.com',
        name: 'Target Folder',
        itemCount: 0,
        subfolderCount: 0,
      };

      const payload = {
        mediaItemIds: [101, 102],
        sourceAssetIds: [201],
        itemCount: 3,
      };

      component.images = [
        {
          id: 101,
          itemType: 'media_item',
          workspaceId: 1,
          createdAt: '',
          metadata: {},
        },
        {
          id: 102,
          itemType: 'media_item',
          workspaceId: 1,
          createdAt: '',
          metadata: {},
        },
        {
          id: 999,
          itemType: 'media_item',
          workspaceId: 1,
          createdAt: '',
          metadata: {},
        },
      ];

      component.onItemDroppedOnFolder(targetFolder, payload);

      expect(folderService.moveItems).toHaveBeenCalledWith({
        workspaceId: 1,
        mediaItemIds: [101, 102],
        sourceAssetIds: [201],
        folderIds: [],
        destinationFolderId: 5,
      });
      expect(component.images.length).toBe(1);
      expect(component.images[0].id).toBe(999);
    });

    it('should move items to root on onBreadcrumbDrop with null folderId', () => {
      component.currentFolderId = 5;
      const payload = {
        mediaItemIds: [101],
        sourceAssetIds: [],
        itemCount: 1,
      };

      const mockEvent = {
        preventDefault: jasmine.createSpy('preventDefault'),
        dataTransfer: {
          getData: (type: string) =>
            type === 'application/json' ? JSON.stringify(payload) : '',
        },
      } as unknown as DragEvent;

      component.onBreadcrumbDrop(mockEvent, null);

      expect(folderService.moveItems).toHaveBeenCalledWith({
        workspaceId: 1,
        mediaItemIds: [101],
        sourceAssetIds: [],
        folderIds: [],
        destinationFolderId: null,
      });
    });

    it('should update dragOverBreadcrumbId on onBreadcrumbDragOver', () => {
      const mockEvent = {
        preventDefault: jasmine.createSpy('preventDefault'),
        dataTransfer: {
          types: ['application/json'],
          dropEffect: '',
        },
      } as unknown as DragEvent;

      component.currentFolderId = 5;
      component.onBreadcrumbDragOver(mockEvent, null);
      expect(component.dragOverBreadcrumbId).toBe('root');

      component.onBreadcrumbDragOver(mockEvent, 2);
      expect(component.dragOverBreadcrumbId).toBe(2);
    });

    it('should call galleryService.bulkMove when moving items across workspaces', () => {
      spyOn(galleryService, 'bulkMove').and.returnValue(of({moved_count: 2}));
      component.images = [
        {id: 1, itemType: 'media_item'} as any,
        {id: 2, itemType: 'source_asset'} as any,
        {id: 3, itemType: 'media_item'} as any,
      ];
      component.selectedItems.add('media_item:1');
      component.selectedItems.add('source_asset:2');

      (component as any).executeMoveToWorkspace(
        [1],
        [2],
        88,
        'Target Workspace',
      );

      expect(galleryService.bulkMove).toHaveBeenCalledWith(
        [
          {id: 1, type: 'media_item'},
          {id: 2, type: 'source_asset'},
        ],
        88,
      );
      expect(component.images.length).toBe(1);
      expect(component.images[0].id).toBe(3);
      expect(component.selectedItems.size).toBe(0);
    });
  });
});
