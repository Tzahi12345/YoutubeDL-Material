import { Component, OnInit, ViewChildren, QueryList, ElementRef, OnDestroy } from '@angular/core';
import { PostsService } from 'app/posts.services';
import { trigger, transition, animateChild, stagger, query, style, animate } from '@angular/animations';
import { Router } from '@angular/router';

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
export class DownloadsComponent implements OnInit, OnDestroy {

  downloads_check_interval = 1000;
  downloads = {};
  interval_id = null;

  keys = Object.keys;

  valid_sessions_length = 0;

  sort_downloads = (a, b) => {
    const result = b.value.timestamp_start - a.value.timestamp_start;
    return result;
  }

  constructor(public postsService: PostsService, private router: Router) { }

  ngOnInit(): void {
    this.getCurrentDownloads();
    this.interval_id = setInterval(() => {
      this.getCurrentDownloads();
    }, this.downloads_check_interval);

    this.postsService.service_initialized.subscribe(init => {
      if (init) {
        if (!this.postsService.config['Extra']['enable_downloads_manager']) {
          this.router.navigate(['/home']);
        }
      }
    });
  }

  ngOnDestroy() {
    if (this.interval_id) { clearInterval(this.interval_id) }
  }

  getCurrentDownloads() {
    this.postsService.getCurrentDownloads().subscribe(res => {
      if (res['downloads']) {
        this.assignNewValues(res['downloads']);
      } else {
        // failed to get downloads
      }
    });
  }

  clearDownload(session_id, download_uid) {
    this.postsService.clearDownloads(false, session_id, download_uid).subscribe(res => {
      if (res['success']) {
        // this.downloads = res['downloads'];
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

  assignNewValues(new_downloads_by_session) {
    const session_keys = Object.keys(new_downloads_by_session);

    // remove missing session IDs
    const current_session_ids = Object.keys(this.downloads);
    const missing_session_ids = current_session_ids.filter(session => session_keys.indexOf(session) === -1)

    for (const missing_session_id of missing_session_ids) {
      delete this.downloads[missing_session_id];
    }

    // loop through sessions
    for (let i = 0; i < session_keys.length; i++) {
      const session_id = session_keys[i];
      const session_downloads_by_id = new_downloads_by_session[session_id];
      const session_download_ids = Object.keys(session_downloads_by_id);

      if (this.downloads[session_id]) {
        // remove missing download IDs
        const current_download_ids = Object.keys(this.downloads[session_id]);
        const missing_download_ids = current_download_ids.filter(download => session_download_ids.indexOf(download) === -1)

        for (const missing_download_id of missing_download_ids) {
          console.log('removing missing download id');
          delete this.downloads[session_id][missing_download_id];
        }
      }

      if (!this.downloads[session_id]) {
        this.downloads[session_id] = session_downloads_by_id;
      } else {
        for (let j = 0; j < session_download_ids.length; j++) {
          const download_id = session_download_ids[j];
          const download = new_downloads_by_session[session_id][download_id]
          if (!this.downloads[session_id][download_id]) {
            this.downloads[session_id][download_id] = download;
          } else {
            const download_to_update = this.downloads[session_id][download_id];
            download_to_update['percent_complete'] = download['percent_complete'];
            download_to_update['complete'] = download['complete'];
            download_to_update['timestamp_end'] = download['timestamp_end'];
            download_to_update['downloading'] = download['downloading'];
            download_to_update['error'] = download['error'];
          }
        }
      }
    }
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
