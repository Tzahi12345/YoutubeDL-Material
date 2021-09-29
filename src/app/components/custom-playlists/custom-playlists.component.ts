import { Component, OnInit } from '@angular/core';
import { PostsService } from 'app/posts.services';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { CreatePlaylistComponent } from 'app/create-playlist/create-playlist.component';
import { ModifyPlaylistComponent } from 'app/dialogs/modify-playlist/modify-playlist.component';

@Component({
  selector: 'app-custom-playlists',
  templateUrl: './custom-playlists.component.html',
  styleUrls: ['./custom-playlists.component.scss']
})
export class CustomPlaylistsComponent implements OnInit {

  playlists = null;
  playlists_received = false;
  downloading_content = {'video': {}, 'audio': {}};

  constructor(public postsService: PostsService, private router: Router, private dialog: MatDialog) { }

  ngOnInit(): void {
    this.postsService.service_initialized.subscribe(init => {
      if (init) {
        this.getAllPlaylists();
      }
    });

    this.postsService.playlists_changed.subscribe(changed => {
      if (changed) {
        this.getAllPlaylists();
      }
    });
  }

  getAllPlaylists() {
    this.playlists_received = false;
    // must call getAllFiles as we need to get category playlists as well
    this.postsService.getPlaylists().subscribe(res => {
      this.playlists = res['playlists'];
      this.playlists_received = true;
    });
  }

  // creating a playlist
  openCreatePlaylistDialog() {
    const dialogRef = this.dialog.open(CreatePlaylistComponent, {
      data: {
      }
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.getAllPlaylists();
        this.postsService.openSnackBar('Successfully created playlist!', '');
      } else if (result === false) {
        this.postsService.openSnackBar('ERROR: failed to create playlist!', '');
      }
    });
  }

  goToPlaylist(info_obj) {
    const playlist = info_obj.file;
    const playlistID = playlist.id;

    if (playlist) {
      if (this.postsService.config['Extra']['download_only_mode']) {
        this.downloadPlaylist(playlist.id, playlist.name);
      } else {
        localStorage.setItem('player_navigator', this.router.url);
        const routeParams = {playlist_id: playlistID};
        if (playlist.auto) { routeParams['auto'] =  playlist.auto; }
        this.router.navigate(['/player', routeParams]);
      }
    } else {
      // playlist not found
      console.error(`Playlist with ID ${playlistID} not found!`);
    }
  }

  downloadPlaylist(playlist_id, playlist_name) {
    this.downloading_content[playlist_id] = true;
    this.postsService.downloadPlaylistFromServer(playlist_id).subscribe(res => {
      this.downloading_content[playlist_id] = false;
      const blob: any = res;
      saveAs(blob, playlist_name + '.zip');
    });

  }

  deletePlaylist(args) {
    const playlist = args.file;
    const index = args.index;
    const playlistID = playlist.id;
    this.postsService.removePlaylist(playlistID, playlist.type).subscribe(res => {
      if (res['success']) {
        this.playlists.splice(index, 1);
        this.postsService.openSnackBar('Playlist successfully removed.', '');
      }
      this.getAllPlaylists();
    });
  }

  editPlaylistDialog(args) {
    const playlist = args.playlist;
    const index = args.index;
    const dialogRef = this.dialog.open(ModifyPlaylistComponent, {
      data: {
        playlist_id: playlist.id,
        width: '65vw'
      }
    });

    dialogRef.afterClosed().subscribe(res => {
      // updates playlist in file manager if it changed
      if (dialogRef.componentInstance.playlist_updated) {
        this.playlists[index] = dialogRef.componentInstance.original_playlist;
      }
    });
  }

}
