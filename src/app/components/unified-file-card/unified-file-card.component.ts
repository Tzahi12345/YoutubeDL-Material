import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { VideoInfoDialogComponent } from 'app/dialogs/video-info-dialog/video-info-dialog.component';

@Component({
  selector: 'app-unified-file-card',
  templateUrl: './unified-file-card.component.html',
  styleUrls: ['./unified-file-card.component.scss']
})
export class UnifiedFileCardComponent implements OnInit {

  // required info
  file_title = '';
  file_length = '';
  file_thumbnail = '';
  type = null;
  elevated = false;

  @Input() file_obj = null;
  @Input() card_size = 'medium';
  @Input() use_youtubedl_archive = false;
  @Input() is_playlist = false;
  @Input() index: number;
  @Output() goToFile = new EventEmitter<any>();
  @Output() goToSubscription = new EventEmitter<any>();
  @Output() deleteFile = new EventEmitter<any>();
  @Output() editPlaylist = new EventEmitter<any>();

  /*
    Planned sizes:
    small: 150x175
    medium: 200x200
    big: 250x200
  */

  constructor(private dialog: MatDialog) { }

  ngOnInit(): void {
    this.file_length = fancyTimeFormat(this.file_obj.duration);
  }

  emitDeleteFile(blacklistMode = false) {
    this.deleteFile.emit({
      file: this.file_obj,
      index: this.index,
      blacklistMode: blacklistMode
    });
  }

  navigateToFile() {
    this.goToFile.emit(this.file_obj);
  }

  navigateToSubscription() {
    this.goToSubscription.emit(this.file_obj);
  }

  openFileInfoDialog() {
    this.dialog.open(VideoInfoDialogComponent, {
      data: {
        file: this.file_obj,
      },
      minWidth: '50vw'
    })
  }

  emitEditPlaylist() {
    this.editPlaylist.emit({
      playlist: this.file_obj,
      index: this.index
    });
  }

}

function fancyTimeFormat(time) {
  if (typeof time === 'string') {
    return time;
  }
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
