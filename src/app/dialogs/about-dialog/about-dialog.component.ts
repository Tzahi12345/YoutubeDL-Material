import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-about-dialog',
  templateUrl: './about-dialog.component.html',
  styleUrls: ['./about-dialog.component.scss']
})
export class AboutDialogComponent implements OnInit {

  projectLink = 'https://github.com/Tzahi12345/YoutubeDL-Material';
  issuesLink = 'https://github.com/Tzahi12345/YoutubeDL-Material/issues';
  latestUpdateLink = 'https://github.com/Tzahi12345/YoutubeDL-Material/releases/latest'

  version = 'v3.5';

  constructor() { }

  ngOnInit(): void {
  }

}
