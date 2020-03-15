import { Component, OnInit, Input, Output } from '@angular/core';
import {PostsService} from '../posts.services';
import { MatSnackBar } from '@angular/material/snack-bar';
import {EventEmitter} from '@angular/core';
import { MainComponent } from 'app/main/main.component';
import { Subject, Observable } from 'rxjs';
import 'rxjs/add/observable/merge';

@Component({
  selector: 'app-file-card',
  templateUrl: './file-card.component.html',
  styleUrls: ['./file-card.component.css']
})
export class FileCardComponent implements OnInit {

  @Input() title: string;
  @Input() length: string;
  @Input() name: string;
  @Input() thumbnailURL: string;
  @Input() isAudio = true;
  @Output() removeFile: EventEmitter<string> = new EventEmitter<string>();
  @Input() isPlaylist = false;
  @Input() count = null;
  type;
  image_loaded = false;
  image_errored = false;

  scrollSubject;
  scrollAndLoad;

  constructor(private postsService: PostsService, public snackBar: MatSnackBar, public mainComponent: MainComponent) {
    this.scrollSubject = new Subject();
    this.scrollAndLoad = Observable.merge(
      Observable.fromEvent(window, 'scroll'),
      this.scrollSubject
    );
  }

  ngOnInit() {
    this.type = this.isAudio ? 'audio' : 'video';
  }

  deleteFile() {
    if (!this.isPlaylist) {
      this.postsService.deleteFile(this.name, this.isAudio).subscribe(result => {
        if (result === true) {
          this.openSnackBar('Delete success!', 'OK.');
          this.removeFile.emit(this.name);
        } else {
          this.openSnackBar('Delete failed!', 'OK.');
        }
      });
    } else {
      this.removeFile.emit(this.name);
    }

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
