import { Component, OnInit, HostListener, EventEmitter } from '@angular/core';
import { VgAPI } from 'ngx-videogular';
import { PostsService } from 'app/posts.services';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { InputDialogComponent } from 'app/input-dialog/input-dialog.component';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ShareMediaDialogComponent } from '../dialogs/share-media-dialog/share-media-dialog.component';

export interface IMedia {
  title: string;
  src: string;
  type: string;
  label: string;
}

@Component({
  selector: 'app-player',
  templateUrl: './player.component.html',
  styleUrls: ['./player.component.css']
})
export class PlayerComponent implements OnInit {

  playlist: Array<IMedia> = [];
  original_playlist: string = null;
  playlist_updating = false;

  show_player = false;

  currentIndex = 0;
  currentItem: IMedia = null;
  api: VgAPI;

  // params
  fileNames: string[];
  type: string;
  id = null; // used for playlists (not subscription)
  uid = null; // used for non-subscription files (audio, video, playlist)
  subscriptionName = null;
  subPlaylist = null;

  is_shared = false;

  db_playlist = null;
  db_file = null;

  baseStreamPath = null;
  audioFolderPath = null;
  videoFolderPath = null;
  subscriptionFolderPath = null;

  // url-mode params
  url = null;
  name = null;

  innerWidth: number;

  downloading = false;

  @HostListener('window:resize', ['$event'])
  onResize(event) {
    this.innerWidth = window.innerWidth;
  }

  ngOnInit(): void {
    this.innerWidth = window.innerWidth;

    this.type = this.route.snapshot.paramMap.get('type');
    this.id = this.route.snapshot.paramMap.get('id');
    this.uid = this.route.snapshot.paramMap.get('uid');
    this.subscriptionName = this.route.snapshot.paramMap.get('subscriptionName');
    this.subPlaylist = this.route.snapshot.paramMap.get('subPlaylist');
    this.url = this.route.snapshot.paramMap.get('url');
    this.name = this.route.snapshot.paramMap.get('name');

    // loading config
    this.postsService.loadNavItems().subscribe(res => { // loads settings
      const result = !this.postsService.debugMode ? res['config_file'] : res;
      this.baseStreamPath = this.postsService.path;
      this.audioFolderPath = result['YoutubeDLMaterial']['Downloader']['path-audio'];
      this.videoFolderPath = result['YoutubeDLMaterial']['Downloader']['path-video'];
      this.subscriptionFolderPath = result['YoutubeDLMaterial']['Subscriptions']['subscriptions_base_path'];
      this.fileNames = this.route.snapshot.paramMap.get('fileNames') ? this.route.snapshot.paramMap.get('fileNames').split('|nvr|') : null;

      if (!this.fileNames) {
        this.is_shared = true;
      }

      if (this.uid && !this.id) {
        this.getFile();
      } else if (this.id) {
        this.getPlaylistFiles();
      }

      if (this.url) {
        // if a url is given, just stream the URL
        this.playlist = [];
        const imedia: IMedia = {
          title: this.name,
          label: this.name,
          src: this.url,
          type: 'video/mp4'
        }
        this.playlist.push(imedia);
        this.currentItem = this.playlist[0];
        this.currentIndex = 0;
        this.show_player = true;
      } else if (this.type === 'subscription' || this.fileNames) {
        this.show_player = true;
        this.parseFileNames();
      }
    });

    // this.getFileInfos();

  }

  constructor(private postsService: PostsService, private route: ActivatedRoute, private dialog: MatDialog, private router: Router,
              public snackBar: MatSnackBar) {

  }

  getFile() {
    const already_has_filenames = !!this.fileNames;
    this.postsService.getFile(this.uid, null).subscribe(res => {
      this.db_file = res['file'];
      if (!this.db_file) {
        this.openSnackBar('Failed to get file information from the server.', 'Dismiss');
        return;
      }
      if (!this.fileNames) {
        // means it's a shared video
        if (!this.id) {
          // regular video/audio file (not playlist)
          this.fileNames = [this.db_file['id']];
          this.type = this.db_file['isAudio'] ? 'audio' : 'video';
          if (!already_has_filenames) { this.parseFileNames(); }
        }
      }
      if (this.db_file['sharingEnabled']) {
        this.show_player = true;
      } else if (!already_has_filenames) {
        this.openSnackBar('Error: Sharing has been disabled for this video!', 'Dismiss');
      }
    });
  }

  getPlaylistFiles() {
    this.postsService.getPlaylist(this.id, null).subscribe(res => {
      this.db_playlist = res['playlist'];
      this.fileNames = this.db_playlist['fileNames'];
      this.type = res['type'];
      this.show_player = true;
      this.parseFileNames();
    });
  }

  parseFileNames() {
    let fileType = null;
    if (this.type === 'audio') {
      fileType = 'audio/mp3';
    } else if (this.type === 'video') {
      fileType = 'video/mp4';
    } else if (this.type === 'subscription') {
      // only supports mp4 for now
      fileType = 'video/mp4';
    } else {
      // error
      console.error('Must have valid file type! Use \'audio\', \'video\', or \'subscription\'.');
    }
    this.playlist = [];
    for (let i = 0; i < this.fileNames.length; i++) {
      const fileName = this.fileNames[i];
      let baseLocation = null;
      let fullLocation = null;
      if (!this.subscriptionName) {
        baseLocation = this.type + '/';
        fullLocation = this.baseStreamPath + baseLocation + encodeURIComponent(fileName);
      } else {
        // default to video but include subscription name param
        baseLocation = 'video/';
        fullLocation = this.baseStreamPath + baseLocation + encodeURIComponent(fileName) + '?subName=' + this.subscriptionName +
                        '&subPlaylist=' + this.subPlaylist;
      }

      // adds user token if in multi-user-mode
      if (this.postsService.isLoggedIn) {
        fullLocation += '?jwt=' + this.postsService.token;
      }
      // if it has a slash (meaning it's in a directory), only get the file name for the label
      let label = null;
      const decodedName = decodeURIComponent(fileName);
      const hasSlash = decodedName.includes('/') || decodedName.includes('\\');
      if (hasSlash) {
        label = decodedName.replace(/^.*[\\\/]/, '');
      } else {
        label = decodedName;
      }
      const mediaObject: IMedia = {
        title: fileName,
        src: fullLocation,
        type: fileType,
        label: label
      }
      this.playlist.push(mediaObject);
    }
    this.currentItem = this.playlist[this.currentIndex];
    this.original_playlist = JSON.stringify(this.playlist);
  }

  onPlayerReady(api: VgAPI) {
      this.api = api;

      this.api.getDefaultMedia().subscriptions.loadedMetadata.subscribe(this.playVideo.bind(this));
      this.api.getDefaultMedia().subscriptions.ended.subscribe(this.nextVideo.bind(this));
  }

  nextVideo() {
      if (this.currentIndex === this.playlist.length - 1) {
        // dont continue playing
          // this.currentIndex = 0;
          return;
      }

      this.currentIndex++;
      this.currentItem = this.playlist[ this.currentIndex ];
  }

  playVideo() {
      this.api.play();
  }

  onClickPlaylistItem(item: IMedia, index: number) {
      // console.log('new current item is ' + item.title + ' at index ' + index);
      this.currentIndex = index;
      this.currentItem = item;
  }

  getFileInfos() {
    const fileNames = this.getFileNames();
    this.postsService.getFileInfo(fileNames, this.type, false).subscribe(res => {

    });
  }

  getFileNames() {
    const fileNames = [];
    for (let i = 0; i < this.playlist.length; i++) {
      fileNames.push(this.playlist[i].title);
    }
    return fileNames;
  }

  decodeURI(string) {
    return decodeURI(string);
  }

  downloadContent() {
    const fileNames = [];
    for (let i = 0; i < this.playlist.length; i++) {
      fileNames.push(this.playlist[i].title);
    }

    const zipName = fileNames[0].split(' ')[0] + fileNames[1].split(' ')[0];
    this.downloading = true;
    this.postsService.downloadFileFromServer(fileNames, this.type, zipName).subscribe(res => {
      this.downloading = false;
      const blob: Blob = res;
      saveAs(blob, zipName + '.zip');
    }, err => {
      console.log(err);
      this.downloading = false;
    });
  }

  downloadFile() {
    const ext = (this.type === 'audio') ? '.mp3' : '.mp4';
    const filename = this.playlist[0].title;
    this.downloading = true;
    this.postsService.downloadFileFromServer(filename, this.type, null, null, this.subscriptionName, this.subPlaylist).subscribe(res => {
      this.downloading = false;
      const blob: Blob = res;
      saveAs(blob, filename + ext);
    }, err => {
      console.log(err);
      this.downloading = false;
    });
  }

  namePlaylistDialog() {
    const done = new EventEmitter<any>();
      const dialogRef = this.dialog.open(InputDialogComponent, {
        width: '300px',
        data: {
          inputTitle: 'Name the playlist',
          inputPlaceholder: 'Name',
          submitText: 'Favorite',
          doneEmitter: done
        }
      });

      done.subscribe(name => {

        // Eventually do additional checks on name
        if (name) {
          const fileNames = this.getFileNames();
          this.postsService.createPlaylist(name, fileNames, this.type, null).subscribe(res => {
            if (res['success']) {
              dialogRef.close();
              const new_playlist = res['new_playlist'];
              this.db_playlist = new_playlist;
              this.openSnackBar('Playlist \'' + name + '\' successfully created!', '')
              this.playlistPostCreationHandler(new_playlist.id);
            }
          });
        }
      });
  }

  /*
  createPlaylist(name) {
    this.postsService.createPlaylist(name, this.fileNames, this.type, null).subscribe(res => {
      if (res['success']) {
        console.log('Success!');
      }
    });
  }
  */

  playlistPostCreationHandler(playlistID) {
    // changes the route without moving from the current view or
    // triggering a navigation event
    this.id = playlistID;
    this.router.navigateByUrl(this.router.url + ';id=' + playlistID);
  }

  drop(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.playlist, event.previousIndex, event.currentIndex);
  }

   playlistChanged() {
    return JSON.stringify(this.playlist) !== this.original_playlist;
  }

  updatePlaylist() {
    const fileNames = this.getFileNames();
    this.playlist_updating = true;
    this.postsService.updatePlaylist(this.id, fileNames, this.type).subscribe(res => {
    this.playlist_updating = false;
      if (res['success']) {
        const fileNamesEncoded = fileNames.join('|nvr|');
        this.router.navigate(['/player', {fileNames: fileNamesEncoded, type: this.type, id: this.id}]);
        this.openSnackBar('Successfully updated playlist.', '');
        this.original_playlist = JSON.stringify(this.playlist);
      } else {
        this.openSnackBar('ERROR: Failed to update playlist.', '');
      }
    })
  }

  openShareDialog() {
    const dialogRef = this.dialog.open(ShareMediaDialogComponent, {
      data: {
        uid: this.id ? this.id : this.uid,
        type: this.type,
        sharing_enabled: this.id ? this.db_playlist.sharingEnabled : this.db_file.sharingEnabled,
        is_playlist: !!this.id
      },
      width: '60vw'
    });

    dialogRef.afterClosed().subscribe(res => {
      if (!this.id) {
        this.getFile();
      } else {
        this.getPlaylistFiles();
      }
    });
  }

  // snackbar helper
  public openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action, {
      duration: 2000,
    });
  }

}
