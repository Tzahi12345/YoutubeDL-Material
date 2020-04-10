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
  descendingMode = true;
  filterProperties = {
    'upload_date': {
      'key': 'upload_date',
      'label': 'Upload Date',
      'property': 'upload_date'
    },
    'name': {
      'key': 'name',
      'label': 'Name',
      'property': 'title'
    },
    'file_size': {
      'key': 'file_size',
      'label': 'File Size',
      'property': 'size'
    },
    'duration': {
      'key': 'duration',
      'label': 'Duration',
      'property': 'duration'
    }
  };
  filterProperty = this.filterProperties['upload_date'];
  downloading = false;

  constructor(private postsService: PostsService, private route: ActivatedRoute, private router: Router) { }

  ngOnInit() {
    if (this.route.snapshot.paramMap.get('id')) {
      this.id = this.route.snapshot.paramMap.get('id');

      this.getSubscription();
      this.getConfig();
    }

    // set filter property to cached
    const cached_filter_property = localStorage.getItem('filter_property');
    if (cached_filter_property && this.filterProperties[cached_filter_property]) {
      this.filterProperty = this.filterProperties[cached_filter_property];
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
      this.filterByProperty(this.filterProperty['property']);
    });
  }

  getConfig() {
    this.postsService.loadNavItems().subscribe(res => {
      const result = !this.postsService.debugMode ? res['config_file'] : res;
      this.use_youtubedl_archive = result['YoutubeDLMaterial']['Subscriptions']['subscriptions_use_youtubedl_archive'];
    });
  }

  goToFile(emit_obj) {
    const name = emit_obj['name'];
    const url = emit_obj['url'];
    localStorage.setItem('player_navigator', this.router.url);
    if (this.subscription.streamingOnly) {
      this.router.navigate(['/player', {name: name, url: url}]);
    } else {
      this.router.navigate(['/player', {fileNames: name, type: 'subscription', subscriptionName: this.subscription.name,
                                        subPlaylist: this.subscription.isPlaylist}]);
    }
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

  filterByProperty(prop) {
    if (this.descendingMode) {
      this.filtered_files = this.filtered_files.sort((a, b) => (a[prop] > b[prop] ? -1 : 1));
    } else {
      this.filtered_files = this.filtered_files.sort((a, b) => (a[prop] > b[prop] ? 1 : -1));
    }
  }

  filterOptionChanged(value) {
    // this.filterProperty = value;
    this.filterByProperty(value['property']);
    localStorage.setItem('filter_property', value['key']);
  }

  toggleModeChange() {
    this.descendingMode = !this.descendingMode;
    this.filterByProperty(this.filterProperty['property']);
  }

  downloadContent() {
    const fileNames = [];
    for (let i = 0; i < this.files.length; i++) {
      fileNames.push(this.files[i].path);
    }

    this.downloading = true;
    this.postsService.downloadFileFromServer(fileNames, 'video', this.subscription.name, true).subscribe(res => {
      this.downloading = false;
      const blob: Blob = res;
      saveAs(blob, this.subscription.name + '.zip');
    }, err => {
      console.log(err);
      this.downloading = false;
    });
  }

}
