import { Component, OnInit } from '@angular/core';
import { PostsService } from 'app/posts.services';
import { Router } from '@angular/router';

@Component({
  selector: 'app-recent-videos',
  templateUrl: './recent-videos.component.html',
  styleUrls: ['./recent-videos.component.scss']
})
export class RecentVideosComponent implements OnInit {

  normal_files_received = false;
  subscription_files_received = false;
  files: any[] = null;
  card_size = 'medium';
  downloading_content = {'video': {}, 'audio': {}};

  constructor(private postsService: PostsService, private router: Router) { }

  ngOnInit(): void {
    this.postsService.service_initialized.subscribe(init => {
      if (init) {
        this.getAllFiles();
      }
    });
  }

  getAllFiles() {
    this.normal_files_received = false;
    this.postsService.getAllFiles().subscribe(res => {
      this.files = res['files'];
      this.files.sort(this.sortFiles);
    });
  }

  // navigation

  goToFile(file) {
    if (this.postsService.config['Extra']['download_only_mode']) {
      this.downloadFile(file);
    } else {
      this.navigateToFile(file);
    }
  }

  navigateToFile(file) {
    localStorage.setItem('player_navigator', this.router.url);
    if (file.sub_id) {
      const sub = this.postsService.getSubscriptionByID(file.sub_id)
      if (sub.streamingOnly) {
        this.router.navigate(['/player', {name: file.id,
                                          url: file.requested_formats ? file.requested_formats[0].url : file.url}]);
      } else {
        this.router.navigate(['/player', {fileNames: file.id,
          type: file.isAudio ? 'audio' : 'video', subscriptionName: sub.name,
          subPlaylist: sub.isPlaylist, uuid: this.postsService.user ? this.postsService.user.uid : null}]);
      }
    } else {
      this.router.navigate(['/player', {type: file.isAudio ? 'audio' : 'video', uid: file.uid}]);
    }
  }

  goToSubscription(file) {
    this.router.navigate(['/subscription', {id: file.sub_id}]);
  }

  // downloading

  downloadFile(file) {
    if (file.sub_id) {
      this.downloadSubscriptionFile(file);
    } else {
      this.downloadNormalFile(file);
    }
  }

  downloadSubscriptionFile(file) {
    const type = file.isAudio ? 'audio' : 'video';
    const ext = type === 'audio' ? '.mp3' : '.mp4'
    const sub = this.postsService.getSubscriptionByID(file.sub_id);
    console.log(sub.isPlaylist)
    this.postsService.downloadFileFromServer(file.id, type, null, null, sub.name, sub.isPlaylist,
      this.postsService.user ? this.postsService.user.uid : null, null).subscribe(res => {
          const blob: Blob = res;
          saveAs(blob, file.id + ext);
        }, err => {
          console.log(err);
      });
  }

  downloadNormalFile(file) {
    const type = file.isAudio ? 'audio' : 'video';
    const ext = type === 'audio' ? '.mp3' : '.mp4'
    const name = file.id;
    this.downloading_content[type][name] = true;
    this.postsService.downloadFileFromServer(name, type).subscribe(res => {
      this.downloading_content[type][name] = false;
      const blob: Blob = res;
      saveAs(blob, decodeURIComponent(name) + ext);

      if (!this.postsService.config.Extra.file_manager_enabled) {
        // tell server to delete the file once downloaded
        this.postsService.deleteFile(name, false).subscribe(delRes => {
          // reload mp4s
          this.getAllFiles();
        });
      }
    });
  }

  // deleting

  deleteFile(args) {
    const file = args.file;
    const index = args.index;
    const blacklistMode = args.blacklistMode;

    if (file.sub_id) {
      this.deleteSubscriptionFile(file, index, blacklistMode);
    } else {
      this.deleteNormalFile(file, index, blacklistMode);
    }
  }

  deleteNormalFile(file, index, blacklistMode = false) {
    this.postsService.deleteFile(file.uid, file.isAudio, blacklistMode).subscribe(result => {
      if (result) {
        this.postsService.openSnackBar('Delete success!', 'OK.');
        this.files.splice(index, 1);
      } else {
        this.postsService.openSnackBar('Delete failed!', 'OK.');
      }
    }, err => {
      this.postsService.openSnackBar('Delete failed!', 'OK.');
    });
  }

  deleteSubscriptionFile(file, index, blacklistMode = false) {
    if (blacklistMode) {
      this.deleteForever(file, index);
    } else {
      this.deleteAndRedownload(file, index);
    }
  }

  deleteAndRedownload(file, index) {
    const sub = this.postsService.getSubscriptionByID(file.sub_id);
    this.postsService.deleteSubscriptionFile(sub, file.id, false, file.uid).subscribe(res => {
      this.postsService.openSnackBar(`Successfully deleted file: '${file.id}'`);
      this.files.splice(index, 1);
    });
  }

  deleteForever(file, index) {
    const sub = this.postsService.getSubscriptionByID(file.sub_id);
    this.postsService.deleteSubscriptionFile(sub, file.id, true, file.uid).subscribe(res => {
      this.postsService.openSnackBar(`Successfully deleted file: '${file.id}'`);
      this.files.splice(index, 1);
    });
  }

  // sorting and filtering

  sortFiles(a, b) {
    // uses the 'registered' flag as the timestamp
    const result = b.registered - a.registered;
    return result;
  }
}
