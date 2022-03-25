import { Component, OnInit, OnDestroy, ViewChild, Input, EventEmitter } from '@angular/core';
import { PostsService } from 'app/posts.services';
import { trigger, transition, animateChild, stagger, query, style, animate } from '@angular/animations';
import { Router } from '@angular/router';
import { MatPaginator } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent } from 'app/dialogs/confirm-dialog/confirm-dialog.component';
import { MatSort } from '@angular/material/sort';
import { Clipboard } from '@angular/cdk/clipboard';

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

  @Input() uids = null;

  downloads_check_interval = 1000;
  downloads = [];
  finished_downloads = [];
  interval_id = null;

  keys = Object.keys;

  valid_sessions_length = 0;

  paused_download_exists = false;
  running_download_exists = false;

  STEP_INDEX_TO_LABEL = {
      0: $localize`Creating download`,
      1: $localize`Getting info`,
      2: $localize`Downloading file`,
      3: $localize`Complete`
  }

  displayedColumns: string[] = ['date', 'title', 'stage', 'subscription', 'progress', 'actions'];
  dataSource = null; // new MatTableDataSource<Download>();
  downloads_retrieved = false;

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;

  sort_downloads = (a, b) => {
    const result = b.timestamp_start - a.timestamp_start;
    return result;
  }

  constructor(public postsService: PostsService, private router: Router, private dialog: MatDialog, private clipboard: Clipboard) { }

  ngOnInit(): void {
    if (this.postsService.initialized) {
      this.getCurrentDownloadsRecurring();
    } else {
      this.postsService.service_initialized.subscribe(init => {
        if (init) {
          this.getCurrentDownloadsRecurring();
        }
      });
    }
  }

  getCurrentDownloadsRecurring(): void {
    if (!this.postsService.config['Extra']['enable_downloads_manager']) {
      this.router.navigate(['/home']);
      return;
    }
    this.getCurrentDownloads();
    this.interval_id = setInterval(() => {
      this.getCurrentDownloads();
    }, this.downloads_check_interval);
  }

  ngOnDestroy(): void {
    if (this.interval_id) { clearInterval(this.interval_id) }
  }

  getCurrentDownloads(): void {
    this.postsService.getCurrentDownloads(this.uids).subscribe(res => {
      this.downloads_retrieved = true;
      if (res['downloads'] !== null 
        && res['downloads'] !== undefined
        && JSON.stringify(this.downloads) !== JSON.stringify(res['downloads'])) {
          this.downloads = this.combineDownloads(this.downloads, res['downloads']);
          // this.downloads = res['downloads'];
          this.downloads.sort(this.sort_downloads);
          this.dataSource = new MatTableDataSource<Download>(this.downloads);
          this.dataSource.paginator = this.paginator;
          this.dataSource.sort = this.sort;

          this.paused_download_exists = this.downloads.find(download => download['paused'] && !download['error']);
          this.running_download_exists = this.downloads.find(download => !download['paused'] && !download['finished']);
      } else {
        // failed to get downloads
      }
    });
  }

  clearFinishedDownloads(): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        dialogTitle: $localize`Clear finished downloads`,
        dialogText: $localize`Would you like to clear your finished downloads?`,
        submitText: $localize`Clear`,
        warnSubmitColor: true
      }
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.postsService.clearFinishedDownloads().subscribe(res => {
          if (!res['success']) {
            this.postsService.openSnackBar('Failed to clear finished downloads!');
          }
        });
      }
    });
  }

  pauseDownload(download_uid: string): void {
    this.postsService.pauseDownload(download_uid).subscribe(res => {
      if (!res['success']) {
        this.postsService.openSnackBar('Failed to pause download! See server logs for more info.');
      }
    });
  }

  pauseAllDownloads(): void {
    this.postsService.pauseAllDownloads().subscribe(res => {
      if (!res['success']) {
        this.postsService.openSnackBar('Failed to pause all downloads! See server logs for more info.');
      }
    });
  }

  resumeDownload(download_uid: string): void {
    this.postsService.resumeDownload(download_uid).subscribe(res => {
      if (!res['success']) {
        this.postsService.openSnackBar('Failed to resume download! See server logs for more info.');
      }
    });
  }

  resumeAllDownloads(): void {
    this.postsService.resumeAllDownloads().subscribe(res => {
      if (!res['success']) {
        this.postsService.openSnackBar('Failed to resume all downloads! See server logs for more info.');
      }
    });
  }

  restartDownload(download_uid: string): void {
    this.postsService.restartDownload(download_uid).subscribe(res => {
      if (!res['success']) {
        this.postsService.openSnackBar('Failed to restart download! See server logs for more info.');
      }
    });
  }

  cancelDownload(download_uid: string): void {
    this.postsService.cancelDownload(download_uid).subscribe(res => {
      if (!res['success']) {
        this.postsService.openSnackBar('Failed to cancel download! See server logs for more info.');
      }
    });
  }

  clearDownload(download_uid: string): void {
    this.postsService.clearDownload(download_uid).subscribe(res => {
      if (!res['success']) {
        this.postsService.openSnackBar('Failed to pause download! See server logs for more info.');
      }
    });
  }

  watchContent(download): void {
    const container = download['container'];
    localStorage.setItem('player_navigator', this.router.url.split(';')[0]);
    const is_playlist = container['uids']; // hacky, TODO: fix
    if (is_playlist) {
      this.router.navigate(['/player', {playlist_id: container['id'], type: download['type']}]);
    } else {
      this.router.navigate(['/player', {type: download['type'], uid: container['uid']}]);
    }
  }

  combineDownloads(downloads_old, downloads_new) {
    // only keeps downloads that exist in the new set
    downloads_old = downloads_old.filter(download_old => downloads_new.some(download_new => download_new.uid === download_old.uid));

    // add downloads from the new set that the old one doesn't have
    const downloads_to_add = downloads_new.filter(download_new => !downloads_old.some(download_old => download_new.uid === download_old.uid));
    downloads_old.push(...downloads_to_add);
    downloads_old.forEach(download_old => {
      const download_new = downloads_new.find(download_to_check => download_old.uid === download_to_check.uid);
      Object.keys(download_new).forEach(key => {
        download_old[key] = download_new[key];
      });
  
      Object.keys(download_old).forEach(key => {
        if (!download_new[key]) delete download_old[key];
      });
    });

    return downloads_old;
  }

  showError(download) {
    const copyToClipboardEmitter = new EventEmitter<boolean>();
    this.dialog.open(ConfirmDialogComponent, {
      data: {
        dialogTitle: $localize`Error for ${download['url']}:url:`,
        dialogText: download['error'],
        submitText: $localize`Copy to clipboard`,
        cancelText: $localize`Close`,
        closeOnSubmit: false,
        onlyEmitOnDone: true,
        doneEmitter: copyToClipboardEmitter
      }
    });
    copyToClipboardEmitter.subscribe(done => {
      if (done) {
        this.postsService.openSnackBar($localize`Copied to clipboard!`);
        this.clipboard.copy(download['error']);
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