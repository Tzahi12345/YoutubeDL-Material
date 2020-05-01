import { Component, OnInit, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PostsService } from 'app/posts.services';

@Component({
  selector: 'app-share-media-dialog',
  templateUrl: './share-media-dialog.component.html',
  styleUrls: ['./share-media-dialog.component.scss']
})
export class ShareMediaDialogComponent implements OnInit {

  type = null;
  uid = null;
  uuid = null;
  share_url = null;
  sharing_enabled = null;
  is_playlist = null;

  constructor(@Inject(MAT_DIALOG_DATA) public data: any, public router: Router, private snackBar: MatSnackBar,
              private postsService: PostsService) { }

  ngOnInit(): void {
    if (this.data) {
      this.type = this.data.type;
      this.uid = this.data.uid;
      this.uuid = this.data.uuid;
      this.sharing_enabled = this.data.sharing_enabled;
      this.is_playlist = this.data.is_playlist;

      const arg = (this.is_playlist ? ';id=' : ';uid=');
      this.share_url = window.location.href.split(';')[0] + arg + this.uid;
      if (this.uuid) {
        this.share_url += ';uuid=' + this.uuid;
      }
    }
  }

  copiedToClipboard() {
    this.openSnackBar('Copied to clipboard!');
  }

  sharingChanged(event) {
    if (event.checked) {
      this.postsService.enableSharing(this.uid, this.type, this.is_playlist).subscribe(res => {
        if (res['success']) {
          this.openSnackBar('Sharing enabled.');
          this.sharing_enabled = true;
        } else {
          this.openSnackBar('Failed to enable sharing.');
        }
      }, err => {
        this.openSnackBar('Failed to enable sharing - server error.');
      });
    } else {
      this.postsService.disableSharing(this.uid, this.type, this.is_playlist).subscribe(res => {
        if (res['success']) {
          this.openSnackBar('Sharing disabled.');
          this.sharing_enabled = false;
        } else {
          this.openSnackBar('Failed to disable sharing.');
        }
      }, err => {
        this.openSnackBar('Failed to disable sharing - server error.');
      });
    }
  }

  public openSnackBar(message: string, action: string = '') {
    this.snackBar.open(message, action, {
      duration: 2000,
    });
  }

}
