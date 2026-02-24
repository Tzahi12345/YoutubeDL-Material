import { Component, OnInit } from '@angular/core';
import { NgxFileDropEntry, FileSystemFileEntry, FileSystemDirectoryEntry } from 'ngx-file-drop';
import { PostsService } from 'app/posts.services';

type CookiesTestResponse = {
  success: boolean;
  logs: string[];
};

@Component({
    selector: 'app-cookies-uploader-dialog',
    templateUrl: './cookies-uploader-dialog.component.html',
    styleUrls: ['./cookies-uploader-dialog.component.scss'],
    standalone: false
})
export class CookiesUploaderDialogComponent implements OnInit {
  public files: NgxFileDropEntry[] = [];

  uploading = false;
  uploaded = false;
  testingCookies = false;
  cookiesTestComplete = false;
  cookiesTestSuccess: boolean = null;
  cookiesTestUrl = '';
  cookiesTestLogs: string[] = [];

  constructor(private postsService: PostsService) { }

  ngOnInit(): void {

  }

  public dropped(files: NgxFileDropEntry[]) {
    this.files = files;
    this.uploading = false;
    this.uploaded = false;
  }

  uploadFile() {
    this.uploading = true;
    for (const droppedFile of this.files) {
      // Is it a file?
      if (droppedFile.fileEntry.isFile) {
        const fileEntry = droppedFile.fileEntry as FileSystemFileEntry;
        fileEntry.file((file: File) => {          
          this.postsService.uploadCookiesFile(file, droppedFile.relativePath).subscribe(res => {
            this.uploading = false;
            if (res['success']) {
              this.uploaded = true;
              this.postsService.openSnackBar($localize`Cookies successfully uploaded!`);
            }
          }, err => {
            console.error(err);
            this.uploading = false;
          });
        });
      }
    }
  }

  runCookiesTest(): void {
    const testUrl = this.cookiesTestUrl ? this.cookiesTestUrl.trim() : '';
    if (!testUrl) {
      this.postsService.openSnackBar($localize`Please provide a URL to test.`);
      return;
    }

    this.testingCookies = true;
    this.cookiesTestComplete = false;
    this.cookiesTestSuccess = null;
    this.cookiesTestLogs = [$localize`Running cookies test...`];

    this.postsService.testCookies(testUrl).subscribe((res: CookiesTestResponse) => {
      this.testingCookies = false;
      this.cookiesTestComplete = true;
      this.cookiesTestSuccess = !!res['success'];
      this.cookiesTestLogs = Array.isArray(res['logs']) ? res['logs'] : [];

      if (this.cookiesTestSuccess) {
        this.postsService.openSnackBar($localize`Cookies test passed.`);
      } else {
        this.postsService.openSnackBar($localize`Cookies test failed. Review the popup logs.`);
      }
    }, err => {
      this.testingCookies = false;
      this.cookiesTestComplete = true;
      this.cookiesTestSuccess = false;
      const error = err && err.error ? err.error : null;
      const errorLogs = error && Array.isArray(error['logs']) ? error['logs'] : null;
      this.cookiesTestLogs = errorLogs && errorLogs.length > 0 ? errorLogs : [$localize`Cookies test failed due to a server error.`];
      this.postsService.openSnackBar($localize`Cookies test failed. Review the popup logs.`);
    });
  }

  public fileOver(event) {
  }

  public fileLeave(event) {
  }
}
