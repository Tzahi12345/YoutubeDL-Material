import { Component, OnInit, Input, Output } from '@angular/core';
import {PostsService} from '../posts.services';
import {MatSnackBar} from '@angular/material';
import {EventEmitter} from '@angular/core';
import { MainComponent } from 'app/main/main.component';

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

  constructor(private postsService: PostsService, public snackBar: MatSnackBar, public mainComponent: MainComponent) { }

  ngOnInit() {
  }

  deleteFile() {
    this.postsService.deleteFile(this.name, this.isAudio).subscribe(result => {
      if (result === true) {
        this.openSnackBar('Delete success!', 'OK.');
        this.removeFile.emit(this.name);
      } else {
        this.openSnackBar('Delete failed!', 'OK.');
      }
    });
  }

  public openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action, {
      duration: 2000,
    });
  }

}
