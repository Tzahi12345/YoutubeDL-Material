import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { PostsService } from 'app/posts.services';
import { MatDialog } from '@angular/material/dialog';
import { VideoInfoDialogComponent } from 'app/dialogs/video-info-dialog/video-info-dialog.component';

@Component({
  selector: 'app-subscription-file-card',
  templateUrl: './subscription-file-card.component.html',
  styleUrls: ['./subscription-file-card.component.scss']
})
export class SubscriptionFileCardComponent implements OnInit {
  image_errored = false;
  image_loaded = false;

  formattedDuration = null;

  @Input() file;
  @Input() sub;
  @Input() use_youtubedl_archive = false;

  @Output() goToFileEmit = new EventEmitter<any>();
  @Output() reloadSubscription = new EventEmitter<boolean>();

  constructor(private snackBar: MatSnackBar, private postsService: PostsService, private dialog: MatDialog) {}

  ngOnInit() {
    if (this.file.duration) {
      this.formattedDuration = fancyTimeFormat(this.file.duration);
    }
  }

  onImgError(event) {
    this.image_errored = true;
  }

  imageLoaded(loaded) {
    this.image_loaded = true;
  }

  goToFile() {
    const emit_obj = {
      uid: this.file.uid,
      url: this.file.requested_formats ? this.file.requested_formats[0].url : this.file.url
    }
    this.goToFileEmit.emit(emit_obj);
  }

  openSubscriptionInfoDialog() {
    const dialogRef = this.dialog.open(VideoInfoDialogComponent, {
      data: {
        file: this.file,
      },
      minWidth: '50vw'
    });
  }

  deleteAndRedownload() {
    this.postsService.deleteSubscriptionFile(this.sub, this.file.id, false, this.file.uid).subscribe(res => {
      this.reloadSubscription.emit(true);
      this.openSnackBar(`Successfully deleted file: '${this.file.id}'`, 'Dismiss.');
    });
  }

  deleteForever() {
    this.postsService.deleteSubscriptionFile(this.sub, this.file.id, true, this.file.uid).subscribe(res => {
      this.reloadSubscription.emit(true);
      this.openSnackBar(`Successfully deleted file: '${this.file.id}'`, 'Dismiss.');
    });
  }

  public openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action, {
      duration: 2000,
    });
  }

}

function fancyTimeFormat(time) {
    // Hours, minutes and seconds
    const hrs = ~~(time / 3600);
    const mins = ~~((time % 3600) / 60);
    const secs = ~~time % 60;

    // Output like "1:01" or "4:03:59" or "123:03:59"
    let ret = '';

    if (hrs > 0) {
        ret += '' + hrs + ':' + (mins < 10 ? '0' : '');
    }

    ret += '' + mins + ':' + (secs < 10 ? '0' : '');
    ret += '' + secs;
    return ret;
}
