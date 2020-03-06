import { Component, OnInit } from '@angular/core';
import { PostsService } from 'app/posts.services';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent implements OnInit {

  constructor(private postsService: PostsService) { }

  ngOnInit() {
  }

  getConfig() {

  }

  setSetting() {
    
  }

}
