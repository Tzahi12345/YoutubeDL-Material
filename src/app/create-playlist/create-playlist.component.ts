import { Component, OnInit, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { UntypedFormControl } from '@angular/forms';
import { PostsService } from 'app/posts.services';
import { Playlist } from 'api-types';

@Component({
  selector: 'app-create-playlist',
  templateUrl: './create-playlist.component.html',
  styleUrls: ['./create-playlist.component.scss']
})
export class CreatePlaylistComponent implements OnInit {
  // really "createAndModifyPlaylistDialogComponent"

  filesToSelectFrom = null;
  type = null;
  filesSelect = new UntypedFormControl();
  audiosToSelectFrom = null;
  videosToSelectFrom = null;
  name = '';
  cached_thumbnail_url = null;

  create_in_progress = false;
  create_mode = false;

  // playlist modify mode

  playlist: Playlist = null;
  playlist_id: string = null;
  preselected_files = [];
  playlist_updated = false;

  constructor(@Inject(MAT_DIALOG_DATA) public data: any,
              private postsService: PostsService,
              public dialogRef: MatDialogRef<CreatePlaylistComponent>) {
                if (this.data?.create_mode) this.create_mode = true;
                if (this.data?.playlist_id) {
                  this.playlist_id = this.data.playlist_id;
                  this.getPlaylist();
                }
  }


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
    }, err => {
      this.create_in_progress = false;
      console.error(err);
    });
  }

  updatePlaylist(): void {
    this.create_in_progress = true;
    this.playlist['name'] = this.name;
    this.playlist['uids'] = this.filesSelect.value;
    this.playlist_updated = true;
    this.postsService.updatePlaylist(this.playlist).subscribe(() => {
      this.create_in_progress = false;
      this.postsService.openSnackBar($localize`Playlist updated successfully.`);
      this.getPlaylist();
      this.postsService.playlists_changed.next(true);
    }, err => {
      this.create_in_progress = false;
      console.error(err)
      this.postsService.openSnackBar($localize`Playlist updated successfully.`);
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

  playlistChanged(): boolean {
    return JSON.stringify(this.playlist.uids) !== JSON.stringify(this.filesSelect.value) || this.name !== this.playlist.name;
  }

  getPlaylist(): void {
    this.postsService.getPlaylist(this.playlist_id, null, true).subscribe(res => {
      if (res['playlist']) {
        this.filesSelect.setValue(res['file_objs'].map(file => file.uid));
        this.preselected_files = res['file_objs'];
        this.playlist = res['playlist'];
        this.name = this.playlist['name']; 
      }
    });
  }
}
