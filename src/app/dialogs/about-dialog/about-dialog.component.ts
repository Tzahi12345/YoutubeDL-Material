import { Component, OnInit } from '@angular/core';
import { PostsService } from 'app/posts.services';
import { CURRENT_VERSION } from 'app/consts';

@Component({
  selector: 'app-about-dialog',
  templateUrl: './about-dialog.component.html',
  styleUrls: ['./about-dialog.component.scss']
})
export class AboutDialogComponent implements OnInit {

  projectLink = 'https://github.com/Tzahi12345/YoutubeDL-Material';
  issuesLink = 'https://github.com/Tzahi12345/YoutubeDL-Material/issues';
  latestUpdateLink = 'https://github.com/Tzahi12345/YoutubeDL-Material/releases/latest'
  latestGithubRelease = null;
  checking_for_updates = true;

  current_version_tag = CURRENT_VERSION;

  constructor(public postsService: PostsService) { }

  ngOnInit(): void {
    this.getLatestGithubRelease();
  }

  getLatestGithubRelease() {
    this.postsService.getLatestGithubRelease().subscribe(res => {
      this.checking_for_updates = false;
      this.latestGithubRelease = res;
    });
  }
}
