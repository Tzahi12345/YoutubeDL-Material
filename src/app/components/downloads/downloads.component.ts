import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { PostsService } from 'app/posts.services';
import { trigger, transition, animateChild, stagger, query, style, animate } from '@angular/animations';
import { Router } from '@angular/router';
import { MatPaginator } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';

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
  downloads = [];
  finished_downloads = [];
  interval_id = null;

  keys = Object.keys;

  valid_sessions_length = 0;

  STEP_INDEX_TO_LABEL = {
      0: 'Creating download',
      1: 'Getting info',
      2: 'Downloading file'
  }

  displayedColumns: string[] = ['date', 'title', 'stage', 'progress', 'actions'];
  dataSource = null; // new MatTableDataSource<Download>();

  @ViewChild(MatPaginator) paginator: MatPaginator;

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

  ngOnDestroy(): void {
    if (this.interval_id) { clearInterval(this.interval_id) }
  }

  getCurrentDownloads(): void {
    this.postsService.getCurrentDownloads().subscribe(res => {
      if (res['downloads'] !== null 
        && res['downloads'] !== undefined
        && JSON.stringify(this.downloads) !== JSON.stringify(res['downloads'])) {
          this.downloads = res['downloads'];
          this.dataSource = new MatTableDataSource<Download>(this.downloads);
          this.dataSource.paginator = this.paginator;
      } else {
        // failed to get downloads
      }
    });
  }

  clearFinishedDownloads(): void {
    this.postsService.clearDownloads(false).subscribe(res => {
      if (res['success']) {
        this.downloads = res['downloads'];
      }
    });
  }

}

export interface Download {
  timestamp_start: number;
  title: string;
  step_index: number;
  progress: string;
}