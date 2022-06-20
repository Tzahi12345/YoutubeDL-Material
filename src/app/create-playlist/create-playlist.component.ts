import { Component, OnInit, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
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
  audiosToSelectFrom = null;
  videosToSelectFrom = null;
  name = '';
  cached_thumbnail_url = null;

  create_in_progress = false;

  constructor(private postsService: PostsService,
              public dialogRef: MatDialogRef<CreatePlaylistComponent>) { }


  ngOnInit(): void {}

  createPlaylist(): void {
    const thumbnailURL = this.getThumbnailURL();
    this.create_in_progress = true;
    this.postsService.createPlaylist(this.name, this.filesSelect.value, thumbnailURL).subscribe(res => {
      this.create_in_progress = false;
      if (res['success']) {
        this.dialogRef.close(true);
      } else {
        this.dialogRef.close(false);
      }
    });
  }

  getThumbnailURL(): string {
    return this.cached_thumbnail_url;
  }

  fileSelectionChanged({new_selection, thumbnailURL}: {new_selection: string[], thumbnailURL: string}): void {
    this.filesSelect.setValue(new_selection);
    if (new_selection.length) this.cached_thumbnail_url = thumbnailURL;
    else                      this.cached_thumbnail_url = null;
  }
}
