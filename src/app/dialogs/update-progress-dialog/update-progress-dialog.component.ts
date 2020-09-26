import { Component, OnInit } from '@angular/core';
import { PostsService } from 'app/posts.services';
import { MatSnackBar } from '@angular/material/snack-bar';
import { UpdaterStatus } from '../../../api-types';

@Component({
  selector: 'app-update-progress-dialog',
  templateUrl: './update-progress-dialog.component.html',
  styleUrls: ['./update-progress-dialog.component.scss']
})
export class UpdateProgressDialogComponent implements OnInit {

  updateStatus: UpdaterStatus = null;
  updateInterval = 250;
  errored = false;

  constructor(private postsService: PostsService, private snackBar: MatSnackBar) { }

  ngOnInit(): void {
    this.getUpdateProgress();
    setInterval(() => {
      if (this.updateStatus['updating']) { this.getUpdateProgress(); }
    }, 250);
  }

  getUpdateProgress() {
    this.postsService.getUpdaterStatus().subscribe(res => {
      if (res) {
        this.updateStatus = res;
        if (this.updateStatus && this.updateStatus['error']) {
          this.openSnackBar('Update failed. Check logs for more details.');
        }
      }
    });
  }

  public openSnackBar(message: string, action: string = '') {
    this.snackBar.open(message, action, {
      duration: 2000,
    });
  }

}
