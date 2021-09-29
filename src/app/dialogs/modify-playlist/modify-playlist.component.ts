import { Component, OnInit, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { PostsService } from 'app/posts.services';

@Component({
  selector: 'app-modify-playlist',
  templateUrl: './modify-playlist.component.html',
  styleUrls: ['./modify-playlist.component.scss']
})
export class ModifyPlaylistComponent implements OnInit {

  playlist_id = null;

  original_playlist = null;
  playlist = null;
  playlist_file_objs = null;

  available_files = [];
  all_files = [];
  playlist_updated = false;
  reverse_order = false;

  constructor(@Inject(MAT_DIALOG_DATA) public data: any,
              private postsService: PostsService,
              public dialogRef: MatDialogRef<ModifyPlaylistComponent>) { }

  ngOnInit(): void {
    if (this.data) {
      this.playlist_id = this.data.playlist_id;
      this.getPlaylist();
    }

    this.reverse_order = localStorage.getItem('default_playlist_order_reversed') === 'true';
  }

  getFiles() {
    if (this.playlist.type === 'audio') {
      this.postsService.getMp3s().subscribe(res => {
        this.processFiles(res['mp3s']);
      });
    } else {
      this.postsService.getMp4s().subscribe(res => {
        this.processFiles(res['mp4s']);
      });
    }
  }

  processFiles(new_files = null) {
    if (new_files) { this.all_files = new_files; }
    this.available_files = this.all_files.filter(e => !this.playlist_file_objs.includes(e))
  }

  updatePlaylist() {
    this.playlist['uids'] = this.playlist_file_objs.map(playlist_file_obj => playlist_file_obj['uid'])
    this.postsService.updatePlaylist(this.playlist).subscribe(res => {
      this.playlist_updated = true;
      this.postsService.openSnackBar('Playlist updated successfully.');
      this.getPlaylist();
      this.postsService.playlists_changed.next(true);
    });
  }

  playlistChanged() {
    return JSON.stringify(this.playlist) !== JSON.stringify(this.original_playlist);
  }

  getPlaylist() {
    this.postsService.getPlaylist(this.playlist_id, null, true).subscribe(res => {
      if (res['playlist']) {
        this.playlist = res['playlist'];
        this.playlist_file_objs = res['file_objs'];
        this.original_playlist = JSON.parse(JSON.stringify(this.playlist));
        this.getFiles();
      }
    });
  }

  addContent(file) {
    this.playlist_file_objs.push(file);
    this.playlist.uids.push(file.uid);
    this.processFiles();
  }

  removeContent(index) {
    if (this.reverse_order) {
      index = this.playlist_file_objs.length - 1 - index;
    }
    this.playlist_file_objs.splice(index, 1);
    this.playlist.uids.splice(index, 1);
    this.processFiles();
  }

  togglePlaylistOrder() {
    this.reverse_order = !this.reverse_order;
    localStorage.setItem('default_playlist_order_reversed', '' + this.reverse_order);
  }

  drop(event: CdkDragDrop<string[]>) {
    if (this.reverse_order) {
      event.previousIndex = this.playlist_file_objs.length - 1 - event.previousIndex;
      event.currentIndex = this.playlist_file_objs.length - 1 - event.currentIndex;
    }
    moveItemInArray(this.playlist_file_objs, event.previousIndex, event.currentIndex);
  }

}
