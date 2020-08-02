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

  downloadFile(file) {
    if (file.sub_id) {

    } else {

    }
  }

  goToSubscription(file) {
    this.router.navigate(['/subscription', {id: file.sub_id}]);
  }

  sortFiles(a, b) {
    // uses the 'registered' flag as the timestamp
    const result = b.registered - a.registered;
    return result;
  }
}
