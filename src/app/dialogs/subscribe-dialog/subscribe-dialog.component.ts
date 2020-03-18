import { Component, OnInit } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PostsService } from 'app/posts.services';

@Component({
  selector: 'app-subscribe-dialog',
  templateUrl: './subscribe-dialog.component.html',
  styleUrls: ['./subscribe-dialog.component.scss']
})
export class SubscribeDialogComponent implements OnInit {
  // inputs
  timerange_amount;
  timerange_unit = 'days';
  download_all = true;
  url = null;
  name = null;

  // state
  subscribing = false;

  time_units = [
    'day',
    'week',
    'month',
    'year'
  ]

  constructor(private postsService: PostsService,
              private snackBar: MatSnackBar,
              public dialogRef: MatDialogRef<SubscribeDialogComponent>) { }

  ngOnInit() {
  }

  subscribeClicked() {
    if (this.url && this.url !== '') {
      // timerange must be specified if download_all is false
      if (!this.download_all && !this.timerange_amount) {
        this.openSnackBar('You must specify an amount of time');
        return;
      }
      this.subscribing = true;

      let timerange = null;
      if (!this.download_all) {
        timerange = 'now-' + this.timerange_amount.toString() + this.timerange_unit;
      }

      this.postsService.createSubscription(this.url, this.name, timerange).subscribe(res => {
        this.subscribing = false;
        if (res['new_sub']) {
          this.dialogRef.close(res['new_sub']);
        } else {
          if (res['error']) {
            this.openSnackBar('ERROR: ' + res['error']);
          }
          this.dialogRef.close();
        }
      });
    }
  }

  public openSnackBar(message: string, action = '') {
    this.snackBar.open(message, action, {
      duration: 2000,
    });
  }

}
