import { Component, OnInit, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material';
import { FormControl } from '@angular/forms';
import { PostsService } from 'app/posts.services';

@Component({
  selector: 'app-create-playlist',
  templateUrl: './create-playlist.component.html',
  styleUrls: ['./create-playlist.component.scss']
})
export class CreatePlaylistComponent implements OnInit {
  // really "createPlaylistDialogComponent"

  filesToSelectFrom = null;
  type = null;
  filesSelect = new FormControl();
  name = '';

  create_in_progress = false;

  constructor(@Inject(MAT_DIALOG_DATA) public data: any,
              private postsService: PostsService,
              public dialogRef: MatDialogRef<CreatePlaylistComponent>) { }


  ngOnInit() {
    if (this.data) {
      this.filesToSelectFrom = this.data.filesToSelectFrom;
      this.type = this.data.type;
    }
  }

  createPlaylist() {
    const thumbnailURL = this.getThumbnailURL();
    this.create_in_progress = true;
    this.postsService.createPlaylist(this.name, this.filesSelect.value, this.type, thumbnailURL).subscribe(res => {
      this.create_in_progress = false;
      if (res['success']) {
        this.dialogRef.close(true);
      } else {
        this.dialogRef.close(false);
      }
    });
  }

  getThumbnailURL() {
    for (let i = 0; i < this.filesToSelectFrom.length; i++) {
      const file = this.filesToSelectFrom[i];
      if (file.id === this.filesSelect.value[0]) {
        // different services store the thumbnail in different places
        if (file.thumbnailURL) { return file.thumbnailURL };
        if (file.thumbnail) { return file.thumbnail };
      }
    }
    return null;
  }

}
