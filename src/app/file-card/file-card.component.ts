import { Component, OnInit, Input, Output } from '@angular/core';
import {PostsService} from '../posts.services';
import { MatSnackBar } from '@angular/material/snack-bar';
import {EventEmitter} from '@angular/core';
import { MainComponent } from 'app/main/main.component';
import { Subject, Observable } from 'rxjs';
import 'rxjs/add/observable/merge';
import { MatDialog } from '@angular/material/dialog';
import { VideoInfoDialogComponent } from 'app/dialogs/video-info-dialog/video-info-dialog.component';
import { ModifyPlaylistComponent } from '../dialogs/modify-playlist/modify-playlist.component';

@Component({
  selector: 'app-file-card',
  templateUrl: './file-card.component.html',
  styleUrls: ['./file-card.component.css']
})
export class FileCardComponent implements OnInit {
  @Input() file: any;
  @Input() title: string;
  @Input() length: string;
  @Input() name: string;
  @Input() uid: string;
  @Input() thumbnailURL: string;
  @Input() isAudio = true;
  @Output() removeFile: EventEmitter<string> = new EventEmitter<string>();
  @Input() playlist = null;
  @Input() count = null;
  @Input() use_youtubedl_archive = false;
  type;
  image_loaded = false;
  image_errored = false;

  scrollSubject;
  scrollAndLoad;

  constructor(private postsService: PostsService, public snackBar: MatSnackBar, public mainComponent: MainComponent, 
    private dialog: MatDialog) {

      this.scrollSubject = new Subject();
    this.scrollAndLoad = Observable.merge(
      Observable.fromEvent(window, 'scroll'),
      this.scrollSubject
    );
  }

  ngOnInit() {
    this.type = this.isAudio ? 'audio' : 'video';

    if (this.file && this.file.url && this.file.url.includes('youtu')) {
      const string_id = (this.playlist ? '?list=' : '?v=')
      const index_offset = (this.playlist ? 6 : 3);
      const end_index = this.file.url.indexOf(string_id) + index_offset;
      this.name = this.file.url.substring(end_index, this.file.url.length);
    }
  }

  deleteFile(blacklistMode = false) {
    if (!this.playlist) {
      this.postsService.deleteFile(this.uid, this.isAudio ? 'audio' : 'video', blacklistMode).subscribe(result => {
        if (result) {
          this.openSnackBar('Delete success!', 'OK.');
          this.removeFile.emit(this.name);
        } else {
          this.openSnackBar('Delete failed!', 'OK.');
        }
      }, err => {
        this.openSnackBar('Delete failed!', 'OK.');
      });
    } else {
      this.removeFile.emit(this.name);
    }

  }

  openVideoInfoDialog() {
    const dialogRef = this.dialog.open(VideoInfoDialogComponent, {
      data: {
        file: this.file,
      },
      minWidth: '50vw'
    });
  }

  editPlaylistDialog() {
    const dialogRef = this.dialog.open(ModifyPlaylistComponent, {
      data: {
        playlist: this.playlist,
        width: '65vw'
      }
    });

    dialogRef.afterClosed().subscribe(res => {
      // updates playlist in file manager if it changed
      if (dialogRef.componentInstance.playlist_updated) {
        this.playlist = dialogRef.componentInstance.original_playlist;
        this.title = this.playlist.name;
        this.count = this.playlist.fileNames.length;
      }
    });
  }

  onImgError(event) {
    this.image_errored = true;
  }

  onHoverResponse() {
    this.scrollSubject.next();
  }

  imageLoaded(loaded) {
    this.image_loaded = true;
  }

  public openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action, {
      duration: 2000,
    });
  }

}
