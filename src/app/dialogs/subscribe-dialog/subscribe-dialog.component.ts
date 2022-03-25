import { Component, OnInit } from '@angular/core';
import { MatDialogRef, MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PostsService } from 'app/posts.services';
import { ArgModifierDialogComponent } from '../arg-modifier-dialog/arg-modifier-dialog.component';

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

  maxQuality = 'best';

  // state
  subscribing = false;

  // no videos actually downloaded, just streamed
  streamingOnlyMode = false;

  // audio only mode
  audioOnlyMode = false;

  customFileOutput = '';
  customArgs = '';

  available_qualities = [
    {
      'label': 'Best',
      'value': 'best'
    },
    {
      'label': '4K',
      'value': '2160'
    },
    {
      'label': '1440p',
      'value': '1440'
    },
    {
      'label': '1080p',
      'value': '1080'
    },
    {
      'label': '720p',
      'value': '720'
    },
    {
      'label': '480p',
      'value': '480'
    },
    {
      'label': '360p',
      'value': '360'
    }
  ];

  time_units = [
    'day',
    'week',
    'month',
    'year'
  ];

  constructor(private postsService: PostsService,
              private snackBar: MatSnackBar,
              private dialog: MatDialog,
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
      this.postsService.createSubscription(this.url, this.name, timerange, this.maxQuality,
                                          this.audioOnlyMode, this.customArgs, this.customFileOutput).subscribe(res => {
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

  // modify custom args
  openArgsModifierDialog() {
    const dialogRef = this.dialog.open(ArgModifierDialogComponent, {
      data: {
       initial_args: this.customArgs
      }
    });
    dialogRef.afterClosed().subscribe(new_args => {
      if (new_args !== null && new_args !== undefined) {
        this.customArgs = new_args;
      }
    });
  }

  public openSnackBar(message: string, action = '') {
    this.snackBar.open(message, action, {
      duration: 2000,
    });
  }

}
