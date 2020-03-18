import { Component, OnInit, Inject } from '@angular/core';
import filesize from 'filesize';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';

@Component({
  selector: 'app-video-info-dialog',
  templateUrl: './video-info-dialog.component.html',
  styleUrls: ['./video-info-dialog.component.scss']
})
export class VideoInfoDialogComponent implements OnInit {
  file: any;
  filesize;
  constructor(@Inject(MAT_DIALOG_DATA) public data: any) { }

  ngOnInit(): void {
    this.filesize = filesize;
    if (this.data) {
      this.file = this.data.file;
    }
  }

}
