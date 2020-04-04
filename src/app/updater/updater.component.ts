import { Component, OnInit } from '@angular/core';
import { PostsService } from 'app/posts.services';
import { CURRENT_VERSION } from 'app/consts';
import { MatDialog } from '@angular/material/dialog';
import { UpdateProgressDialogComponent } from 'app/dialogs/update-progress-dialog/update-progress-dialog.component';
@Component({
  selector: 'app-updater',
  templateUrl: './updater.component.html',
  styleUrls: ['./updater.component.scss']
})
export class UpdaterComponent implements OnInit {

  availableVersions = null;
  availableVersionsFiltered = [];
  versionsShowLimit = 5;
  latestStableRelease = null;
  selectedVersion = null;
  CURRENT_VERSION = CURRENT_VERSION;

  constructor(private postsService: PostsService, private dialog: MatDialog) { }

  ngOnInit(): void {
    this.getAvailableVersions();
  }

  updateServer() {
    this.postsService.updateServer(this.selectedVersion).subscribe(res => {
      if (res['success']) {
        this.openUpdateProgressDialog();
      }
    });
  }

  getAvailableVersions() {
    this.availableVersionsFiltered = [];
    this.postsService.getAvailableRelease().subscribe(res => {
      this.availableVersions = res;
      for (let i = 0; i < this.availableVersions.length; i++) {
        const currentVersion = this.availableVersions[i];
        // if a stable release has not been found and the version is not "rc" (meaning it's stable) then set it as the stable release
        if (!this.latestStableRelease && !currentVersion.tag_name.includes('rc')) {
          this.latestStableRelease = currentVersion;
          this.selectedVersion = this.latestStableRelease.tag_name;
        }

        if (this.latestStableRelease && i >= this.versionsShowLimit) {
          break;
        }

        this.availableVersionsFiltered.push(currentVersion);
      }
    });
  }

  openUpdateProgressDialog() {
    this.dialog.open(UpdateProgressDialogComponent, {
      minWidth: '300px',
      minHeight: '200px'
    });
  }

}
