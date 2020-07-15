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

  original_playlist = null;
  playlist = null;
  available_files = [];
  all_files = [];
  playlist_updated = false;

  constructor(@Inject(MAT_DIALOG_DATA) public data: any,
              private postsService: PostsService,
              public dialogRef: MatDialogRef<ModifyPlaylistComponent>) { }

  ngOnInit(): void {
    if (this.data) {
      this.playlist = JSON.parse(JSON.stringify(this.data.playlist));
      this.original_playlist = JSON.parse(JSON.stringify(this.data.playlist));
      this.getFiles();
    }
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
    if (new_files) { this.all_files = new_files.map(file => file.id); }
    this.available_files = this.all_files.filter(e => !this.playlist.fileNames.includes(e))
  }

  updatePlaylist() {
    this.postsService.updatePlaylist(this.playlist).subscribe(res => {
      this.playlist_updated = true;
      this.postsService.openSnackBar('Playlist updated successfully.');
      this.getPlaylist();
    });
  }

  playlistChanged() {
    return JSON.stringify(this.playlist) === JSON.stringify(this.original_playlist);
  }

  getPlaylist() {
    this.postsService.getPlaylist(this.playlist.id, this.playlist.type, null).subscribe(res => {
      if (res['playlist']) {
        this.playlist = res['playlist'];
        this.original_playlist = JSON.parse(JSON.stringify(this.playlist));
      }
    });
  }

  addContent(file) {
    this.playlist.fileNames.push(file);
    this.processFiles();
  }

  removeContent(index) {
    this.playlist.fileNames.splice(index, 1);
    this.processFiles();
  }

  drop(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.playlist.fileNames, event.previousIndex, event.currentIndex);
  }

}
