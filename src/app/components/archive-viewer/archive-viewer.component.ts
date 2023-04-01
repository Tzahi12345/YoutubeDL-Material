import { SelectionModel } from '@angular/cdk/collections';
import { Component, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { FileType } from 'api-types';
import { Archive } from 'api-types/models/Archive';
import { ConfirmDialogComponent } from 'app/dialogs/confirm-dialog/confirm-dialog.component';
import { PostsService } from 'app/posts.services';
import { NgxFileDropEntry } from 'ngx-file-drop';

@Component({
  selector: 'app-archive-viewer',
  templateUrl: './archive-viewer.component.html',
  styleUrls: ['./archive-viewer.component.scss']
})
export class ArchiveViewerComponent {
  // table
  displayedColumns: string[] = ['select', 'timestamp', 'title', 'id', 'extractor'];
  dataSource = null;
  selection = new SelectionModel<Archive>(true, []);

  // general
  archives = null;
  archives_retrieved = false;
  text_filter = '';
  sub_id = 'none';
  upload_sub_id = 'none';
  type: FileType | 'both' = 'both';
  upload_type: FileType = FileType.VIDEO;

  // importing
  uploading_archive = false;
  uploaded_archive = false;
  files = [];

  typeSelectOptions = {
    video: {
      key: 'video',
      label: $localize`Video`
    },
    audio: {
      key: 'audio',
      label: $localize`Audio`
    }
  };

  @ViewChild(MatSort) sort: MatSort;
  
  constructor(public postsService: PostsService, private dialog: MatDialog) {

  }

  ngOnInit() {
    this.getArchives();
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }

  /** Whether the number of selected elements matches the total number of rows. */
  isAllSelected() {
    const numSelected = this.selection.selected.length;
    const numRows = this.dataSource.data.length;
    return numSelected === numRows;
  }

  /** Selects all rows if they are not all selected; otherwise clear selection. */
  toggleAllRows() {
    if (this.isAllSelected()) {
      this.selection.clear();
      return;
    }

    this.selection.select(...this.dataSource.data);
  }

  typeFilterSelectionChanged(value): void {
    this.type = value;
    this.dataSource.filter = '';
    this.text_filter = '';
    this.getArchives();
  }

  subFilterSelectionChanged(value): void {
    this.sub_id = value;
    this.dataSource.filter = '';
    this.text_filter = '';
    if (this.sub_id !== 'none') {
      this.type = this.postsService.getSubscriptionByID(this.sub_id)['type'];
    }
    this.getArchives();
  }

  subUploadFilterSelectionChanged(value): void {
    this.upload_sub_id = value;
    if (this.upload_sub_id !== 'none') {
      this.upload_type = this.postsService.getSubscriptionByID(this.upload_sub_id)['type'];
    }
  }

  getArchives(): void {
    this.postsService.getArchives(this.type === 'both' ? null : this.type, this.sub_id === 'none' ? null : this.sub_id).subscribe(res => {
      if (res['archives'] !== null 
        && res['archives'] !== undefined
        && JSON.stringify(this.archives) !== JSON.stringify(res['archives'])) {
          this.archives = res['archives']
          this.dataSource = new MatTableDataSource<Archive>(this.archives);
          this.dataSource.sort = this.sort;
      } else {
        // failed to get downloads
      }
    });
  }

  importArchive(): void {
    this.uploading_archive = true;
        for (const droppedFile of this.files) {
      // Is it a file?
      if (droppedFile.fileEntry.isFile) {
        const fileEntry = droppedFile.fileEntry as FileSystemFileEntry;
        fileEntry.file(async (file: File) => {          
          const archive_base64 = await blobToBase64(file);
          this.postsService.importArchive(archive_base64 as string, this.upload_type, this.upload_sub_id === 'none' ? null : this.upload_sub_id).subscribe(res => {
            this.uploading_archive = false;
            if (res['success']) {
              this.uploaded_archive = true;
              this.postsService.openSnackBar($localize`Archive successfully imported!`);
            }
            this.getArchives();
          }, err => {
            console.error(err);
            this.uploading_archive = false;
          });
        });
      }
    }
  }

  downloadArchive(): void {
    this.postsService.downloadArchive(this.type === 'both' ? null : this.type, this.sub_id === 'none' ? null : this.sub_id).subscribe(res => {
      const blob: Blob = res;
      saveAs(blob, 'archive.txt');
    });
  }

  openDeleteSelectedArchivesDialog(): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        dialogTitle: $localize`Delete archives`,
        dialogText: $localize`Would you like to delete ${this.selection.selected.length}:selected archives amount: archive(s)?`,
        submitText: $localize`Delete`,
        warnSubmitColor: true
      }
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.deleteSelectedArchives();
      }
    });
    
  }

  deleteSelectedArchives(): void {
    for (const archive of this.selection.selected) {
      this.archives = this.archives.filter((_archive: Archive) => !(archive['extractor'] === _archive['extractor'] && archive['id'] !== _archive['id']));
    }
    this.postsService.deleteArchiveItems(this.selection.selected).subscribe(res => {
      if (res['success']) {
        this.postsService.openSnackBar($localize`Successfully deleted archive items!`);
      } else {
        this.postsService.openSnackBar($localize`Failed to delete archive items!`);
      }
      this.getArchives();
    });
    this.selection.clear();
  }

  public dropped(files: NgxFileDropEntry[]) {
    this.files = files;
    this.uploading_archive = false;
    this.uploaded_archive = false;
  }

  originalOrder = (): number => {
    return 0;
  }
}

function blobToBase64(blob: Blob) {
  return new Promise((resolve, _) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}
