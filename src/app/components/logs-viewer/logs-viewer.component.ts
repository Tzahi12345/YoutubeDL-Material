import { Component, OnInit, AfterViewInit } from '@angular/core';
import { PostsService } from '../../posts.services';

@Component({
  selector: 'app-logs-viewer',
  templateUrl: './logs-viewer.component.html',
  styleUrls: ['./logs-viewer.component.scss']
})
export class LogsViewerComponent implements OnInit {

  logs: string = null;
  requested_lines = 50;
  logs_loading = false;
  constructor(private postsService: PostsService) { }

  ngOnInit(): void {
    this.getLogs();
  }

  getLogs() {
  if (!this.logs) { this.logs_loading = true; } // only show loading spinner at the first load
    this.postsService.getLogs(this.requested_lines !== 0 ? this.requested_lines : null).subscribe(res => {
      this.logs_loading = false;
      if (res['logs']) {
        this.logs = res['logs'];
      } else {
        this.postsService.openSnackBar('Failed to retrieve logs!');
      }
    }, err => {
      this.logs_loading = false;
      console.error(err);
      this.postsService.openSnackBar('Failed to retrieve logs!');
    });
  }

  copiedLogsToClipboard() {
    this.postsService.openSnackBar('Logs copied to clipboard!');
  }

}
