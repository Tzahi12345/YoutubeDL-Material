import { Component, OnInit, ViewChildren, QueryList, ElementRef } from '@angular/core';
import { PostsService } from 'app/posts.services';
import { trigger, transition, animateChild, stagger, query, style, animate } from '@angular/animations';

@Component({
  selector: 'app-downloads',
  templateUrl: './downloads.component.html',
  styleUrls: ['./downloads.component.scss'],
  animations: [
    // nice stagger effect when showing existing elements
    trigger('list', [
      transition(':enter', [
        // child animation selector + stagger
        query('@items',
          stagger(100, animateChild()), { optional: true }
        )
      ]),
    ]),
    trigger('items', [
      // cubic-bezier for a tiny bouncing feel
      transition(':enter', [
        style({ transform: 'scale(0.5)', opacity: 0 }),
        animate('500ms cubic-bezier(.8,-0.6,0.2,1.5)',
          style({ transform: 'scale(1)', opacity: 1 }))
      ]),
      transition(':leave', [
        style({ transform: 'scale(1)', opacity: 1, height: '*' }),
        animate('1s cubic-bezier(.8,-0.6,0.2,1.5)',
          style({ transform: 'scale(0.5)', opacity: 0, height: '0px', margin: '0px' }))
      ]),
    ])
  ],
})
export class DownloadsComponent implements OnInit {

  downloads_check_interval = 500;
  downloads = null;

  keys = Object.keys;

  valid_sessions_length = 0;

  constructor(public postsService: PostsService) { }

  ngOnInit(): void {
    this.getCurrentDownloads();
    setInterval(() => {
      this.getCurrentDownloads();
    }, this.downloads_check_interval);
  }

  getCurrentDownloads() {
    this.postsService.getCurrentDownloads().subscribe(res => {
      if (res['downloads']) {
        if (JSON.stringify(this.downloads) !== JSON.stringify(res['downloads'])) {
          // if they're not the same, then replace
          this.downloads = res['downloads'];
        }
      } else {
        // failed to get downloads
      }
    });
  }

  clearDownload(session_id, download_uid) {
    this.postsService.clearDownloads(false, session_id, download_uid).subscribe(res => {
      if (res['success']) {
        this.downloads = res['downloads'];
      } else {
      }
    });
  }

  clearDownloads(session_id) {
    this.postsService.clearDownloads(false, session_id).subscribe(res => {
      if (res['success']) {
        this.downloads = res['downloads'];
      } else {
      }
    });
  }

  clearAllDownloads() {
    this.postsService.clearDownloads(true).subscribe(res => {
      if (res['success']) {
        this.downloads = res['downloads'];
      } else {
      }
    });
  }

  downloadsValid() {
    let valid = false;
    const keys = this.keys(this.downloads);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const value = this.downloads[key];
      if (this.keys(value).length > 0) {
        valid = true;
        break;
      }
    }
    return valid;
  }

}
