import { Component, OnInit } from '@angular/core';
import { PostsService } from 'app/posts.services';

@Component({
  selector: 'app-recent-videos',
  templateUrl: './recent-videos.component.html',
  styleUrls: ['./recent-videos.component.scss']
})
export class RecentVideosComponent implements OnInit {

  normal_files_received = false;
  subscription_files_received = false;
  files: any[] = null;

  constructor(private postsService: PostsService) { }

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

  sortFiles(a, b) {
    // uses the 'registered' flag as the timestamp
    const result = b.registered - a.registered;
    return result;
  }
}
