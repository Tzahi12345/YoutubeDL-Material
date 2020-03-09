import { Component, OnInit } from '@angular/core';
import { PostsService } from 'app/posts.services';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-subscription',
  templateUrl: './subscription.component.html',
  styleUrls: ['./subscription.component.scss']
})
export class SubscriptionComponent implements OnInit {

  id = null;
  subscription = null;
  files: any[] = null;
  filtered_files: any[] = null;
  use_youtubedl_archive = false;
  search_mode = false;
  search_text = '';
  searchIsFocused = false;

  constructor(private postsService: PostsService, private route: ActivatedRoute, private router: Router) { }

  ngOnInit() {
    if (this.route.snapshot.paramMap.get('id')) {
      this.id = this.route.snapshot.paramMap.get('id');

      this.getSubscription();
      this.getConfig();
    }
  }

  goBack() {
    this.router.navigate(['/subscriptions']);
  }

  getSubscription() {
    this.postsService.getSubscription(this.id).subscribe(res => {
      this.subscription = res['subscription'];
      this.files = res['files'];
      if (this.search_mode) {
        this.filterFiles(this.search_text);
      } else {
        this.filtered_files = this.files;
      }
    });
  }

  getConfig() {
    this.postsService.loadNavItems().subscribe(res => {
      const result = !this.postsService.debugMode ? res['config_file'] : res;
      this.use_youtubedl_archive = result['YoutubeDLMaterial']['Subscriptions']['subscriptions_use_youtubedl_archive'];
    });
  }

  goToFile(name) {
    localStorage.setItem('player_navigator', this.router.url);
    this.router.navigate(['/player', {fileNames: name, type: 'subscription', subscriptionName: this.subscription.name,
                                      subPlaylist: this.subscription.isPlaylist}]);
  }

  onSearchInputChanged(newvalue) {
    if (newvalue.length > 0) {
      this.search_mode = true;
      this.filterFiles(newvalue);
    } else {
      this.search_mode = false;
    }
  }

  private filterFiles(value: string) {
    const filterValue = value.toLowerCase();
    this.filtered_files = this.files.filter(option => option.id.toLowerCase().includes(filterValue));
  }

}
