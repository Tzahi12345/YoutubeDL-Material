import { Component, OnInit, Input, Output, EventEmitter, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { VideoInfoDialogComponent } from 'app/dialogs/video-info-dialog/video-info-dialog.component';
import { DomSanitizer } from '@angular/platform-browser';
import { MatMenuTrigger } from '@angular/material/menu';
import { registerLocaleData } from '@angular/common';
import localeGB from '@angular/common/locales/en-GB';
import localeFR from '@angular/common/locales/fr';
import localeES from '@angular/common/locales/es';
import localeDE from '@angular/common/locales/de';
import localeZH from '@angular/common/locales/zh';
import localeNB from '@angular/common/locales/nb';

registerLocaleData(localeGB);
registerLocaleData(localeFR);
registerLocaleData(localeES);
registerLocaleData(localeDE);
registerLocaleData(localeZH);
registerLocaleData(localeNB);

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

  // optional vars
  thumbnailBlobURL = null;

  streamURL = null;
  hide_image = false;

  // input/output
  @Input() loading = true;
  @Input() theme = null;
  @Input() file_obj = null;
  @Input() card_size = 'medium';
  @Input() use_youtubedl_archive = false;
  @Input() is_playlist = false;
  @Input() index: number;
  @Input() locale = null;
  @Input() baseStreamPath = null;
  @Input() jwtString = null;
  @Input() availablePlaylists = null;
  @Output() goToFile = new EventEmitter<any>();
  @Output() goToSubscription = new EventEmitter<any>();
  @Output() deleteFile = new EventEmitter<any>();
  @Output() addFileToPlaylist = new EventEmitter<any>();
  @Output() editPlaylist = new EventEmitter<any>();


  @ViewChild(MatMenuTrigger) contextMenu: MatMenuTrigger;
  contextMenuPosition = { x: '0px', y: '0px' };

  /*
    Planned sizes:
    small: 150x175
    medium: 200x200
    big: 250x200
  */

  constructor(private dialog: MatDialog, private sanitizer: DomSanitizer) { }

  ngOnInit(): void {
    if (!this.loading) {
      this.file_length = fancyTimeFormat(this.file_obj.duration);
    }

    if (this.file_obj && this.file_obj.thumbnailPath) {
      this.thumbnailBlobURL = `${this.baseStreamPath}thumbnail/${encodeURIComponent(this.file_obj.thumbnailPath)}?jwt=${this.jwtString}`;
      /*const mime = getMimeByFilename(this.file_obj.thumbnailPath);
      const blob = new Blob([new Uint8Array(this.file_obj.thumbnailBlob.data)], {type: mime});
      const bloburl = URL.createObjectURL(blob);
      this.thumbnailBlobURL = this.sanitizer.bypassSecurityTrustUrl(bloburl);*/
    }

    if (this.file_obj) this.streamURL = this.generateStreamURL();
  }

  emitDeleteFile(blacklistMode = false) {
    this.deleteFile.emit({
      file: this.file_obj,
      index: this.index,
      blacklistMode: blacklistMode
    });
  }

  emitAddFileToPlaylist(playlist_id) {
    this.addFileToPlaylist.emit({
      file: this.file_obj,
      playlist_id: playlist_id
    });
  }

  navigateToFile(event) {
    this.goToFile.emit({file: this.file_obj, event: event});
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

  onRightClick(event) {
    event.preventDefault();
    this.contextMenuPosition.x = event.clientX + 'px';
    this.contextMenuPosition.y = event.clientY + 'px';
    this.contextMenu.menuData = { 'item': {id: 1, name: 'hi'} };
    this.contextMenu.menu.focusFirstItem('mouse');
    this.contextMenu.openMenu();
  }

  generateStreamURL() {
    const baseLocation = 'stream/';
    let fullLocation = this.baseStreamPath + baseLocation + `?test=test&uid=${this.file_obj['uid']}`;
    if (this.jwtString) {
      fullLocation += `&jwt=${this.jwtString}`;
    }

    fullLocation += '&t=,10';

    return fullLocation;
  }

  onMouseOver() {
    this.elevated = true;
    setTimeout(() => {
      if (this.elevated) {
        this.hide_image = true;
      }
    }, 500);
  }

  onMouseOut() {
    this.elevated = false;
    this.hide_image = false;
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

function getMimeByFilename(name) {
  switch (name.substring(name.length-4, name.length)) {
    case '.jpg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    default:
      return null;
  }
}