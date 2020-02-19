import { Component, OnInit, HostListener, EventEmitter } from '@angular/core';
import { VgAPI } from 'videogular2/compiled/core';
import { PostsService } from 'app/posts.services';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog, MatSnackBar } from '@angular/material';
import { InputDialogComponent } from 'app/input-dialog/input-dialog.component';

export interface IMedia {
  title: string;
  src: string;
  type: string;
}

@Component({
  selector: 'app-player',
  templateUrl: './player.component.html',
  styleUrls: ['./player.component.css']
})
export class PlayerComponent implements OnInit {

  playlist: Array<IMedia> = [];

  currentIndex = 0;
  currentItem: IMedia = null;
  api: VgAPI;

  // params
  fileNames: string[];
  type: string;

  baseStreamPath = null;
  audioFolderPath = null;
  videoFolderPath = null;
  innerWidth: number;

  downloading = false;

  id = null;

  @HostListener('window:resize', ['$event'])
  onResize(event) {
    this.innerWidth = window.innerWidth;
  }

  ngOnInit(): void {
    this.innerWidth = window.innerWidth;

    this.fileNames = this.route.snapshot.paramMap.get('fileNames').split('|nvr|');
    this.type = this.route.snapshot.paramMap.get('type');
    this.id = this.route.snapshot.paramMap.get('id');

    // loading config
    this.postsService.loadNavItems().subscribe(result => { // loads settings
      this.baseStreamPath = result['YoutubeDLMaterial']['Downloader']['path-base'];
      this.audioFolderPath = result['YoutubeDLMaterial']['Downloader']['path-audio'];
      this.videoFolderPath = result['YoutubeDLMaterial']['Downloader']['path-video'];
      const backendUrl = result['YoutubeDLMaterial']['Host']['backendurl'];

      this.postsService.path = backendUrl;
      this.postsService.startPath = backendUrl;
      this.postsService.startPathSSL = backendUrl;

      let fileType = null;
      if (this.type === 'audio') {
        fileType = 'audio/mp3';
      } else if (this.type === 'video') {
        fileType = 'video/mp4';
      } else {
        // error
        console.error('Must have valid file type! Use \'audio\' or \video\'');
      }

      for (let i = 0; i < this.fileNames.length; i++) {
        const fileName = this.fileNames[i];
        const baseLocation = (this.type === 'audio') ? this.audioFolderPath : this.videoFolderPath;
        const fullLocation = this.baseStreamPath + baseLocation + fileName; // + (this.type === 'audio' ? '.mp3' : '.mp4');
        const mediaObject: IMedia = {
          title: fileName,
          src: fullLocation,
          type: fileType
        }
        this.playlist.push(mediaObject);
      }
      this.currentItem = this.playlist[this.currentIndex];
    });

    // this.getFileInfos();

  }

  constructor(private postsService: PostsService, private route: ActivatedRoute, private dialog: MatDialog, private router: Router,
              public snackBar: MatSnackBar) {

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
    this.postsService.getFileInfo(this.fileNames, this.type, false).subscribe(res => {

    });
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
    this.postsService.downloadFileFromServer(filename, this.type).subscribe(res => {
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
          this.postsService.createPlaylist(name, this.fileNames, this.type, null).subscribe(res => {
            if (res['success']) {
              dialogRef.close();
              const new_playlist = res['new_playlist'];
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
    console.log(this.router.url);
    this.router.navigateByUrl(this.router.url + ';id=' + playlistID);
  }

  // snackbar helper
  public openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action, {
      duration: 2000,
    });
  }

}
