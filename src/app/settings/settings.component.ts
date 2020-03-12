import { Component, OnInit } from '@angular/core';
import { PostsService } from 'app/posts.services';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent implements OnInit {

  initial_config = null;
  new_config = null
  loading_config = false;

  constructor(private postsService: PostsService) { }

  ngOnInit() {
    this.getConfig();
  }

  getConfig() {
    this.loading_config = true;
    this.postsService.loadNavItems().subscribe(res => {
      this.loading_config = false;
      // successfully loaded config

      this.initial_config = !this.postsService.debugMode ? res['config_file']['YoutubeDLMaterial'] : res['YoutubeDLMaterial'];
      this.new_config = JSON.parse(JSON.stringify(this.initial_config));
    });
  }

  settingsSame() {
    return JSON.stringify(this.new_config) === JSON.stringify(this.initial_config);
  }

  saveSettings() {
    const settingsToSave = {'YoutubeDLMaterial': this.new_config};
    this.postsService.setConfig(settingsToSave).subscribe(res => {
      if (res['success']) {
        // sets new config as old config
        this.postsService.settings_changed.next(true);
        this.initial_config = JSON.parse(JSON.stringify(this.new_config));
      }
    }, err => {
      console.error('Failed to save config!');
    })
  }

}
