import { Component, OnInit } from '@angular/core';
import { PostsService } from '../../posts.services';

@Component({
  selector: 'app-logs-viewer',
  templateUrl: './logs-viewer.component.html',
  styleUrls: ['./logs-viewer.component.scss']
})
export class LogsViewerComponent implements OnInit {

  logs: string = null;

  constructor(private postsService: PostsService) { }

  ngOnInit(): void {
    this.getLogs();
  }

  getLogs() {
    this.postsService.getLogs().subscribe(res => {
      if (res['logs']) {
        this.logs = res['logs'];
      } else {
        this.postsService.openSnackBar('Failed to retrieve logs!');
      }
    }, err => {
      console.error(err);
      this.postsService.openSnackBar('Failed to retrieve logs!');
    });
  }

}
