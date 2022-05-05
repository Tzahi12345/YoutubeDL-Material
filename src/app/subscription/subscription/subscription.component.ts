import { Component, OnDestroy, OnInit } from '@angular/core';
import { PostsService } from 'app/posts.services';
import { ActivatedRoute, Router, ParamMap } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { EditSubscriptionDialogComponent } from 'app/dialogs/edit-subscription-dialog/edit-subscription-dialog.component';

@Component({
  selector: 'app-subscription',
  templateUrl: './subscription.component.html',
  styleUrls: ['./subscription.component.scss']
})
export class SubscriptionComponent implements OnInit, OnDestroy {

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
  sub_interval = null;

  constructor(private postsService: PostsService, private route: ActivatedRoute, private router: Router, private dialog: MatDialog) { }

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.id = params['id'];

      if (this.sub_interval) { clearInterval(this.sub_interval); }

      this.postsService.service_initialized.subscribe(init => {
        if (init) {
          this.getConfig();
          this.getSubscription();
          this.sub_interval = setInterval(() => this.getSubscription(true), 1000);
        }
      });
    });

    // set filter property to cached
    const cached_filter_property = localStorage.getItem('filter_property');
    if (cached_filter_property && this.filterProperties[cached_filter_property]) {
      this.filterProperty = this.filterProperties[cached_filter_property];
    }
  }

  ngOnDestroy() {
    // prevents subscription getter from running in the background
    if (this.sub_interval) {
      clearInterval(this.sub_interval);
    }
  }

  goBack() {
    this.router.navigate(['/subscriptions']);
  }

  getSubscription(low_cost = false) {
    this.postsService.getSubscription(this.id).subscribe(res => {
      if (low_cost && res['subscription'].videos.length === this.subscription?.videos.length) {
        if (res['subscription']['downloading'] !== this.subscription['downloading']) {
          this.subscription['downloading'] = res['subscription']['downloading'];
        }
        return;
      }
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
    this.use_youtubedl_archive = this.postsService.config['Downloader']['use_youtubedl_archive'];
  }

  goToFile(emit_obj) {
    const uid = emit_obj['uid'];
    const url = emit_obj['url'];
    localStorage.setItem('player_navigator', this.router.url);
    if (this.subscription.streamingOnly) {
      this.router.navigate(['/player', {uid: uid, url: url}]);
    } else {
      this.router.navigate(['/player', {uid: uid}]);
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
    this.postsService.downloadSubFromServer(this.subscription.id).subscribe(res => {
      this.downloading = false;
      const blob: Blob = res;
      saveAs(blob, this.subscription.name + '.zip');
    }, err => {
      console.log(err);
      this.downloading = false;
    });
  }

  editSubscription() {
    this.dialog.open(EditSubscriptionDialogComponent, {
      data: {
        sub: this.postsService.getSubscriptionByID(this.subscription.id)
      }
    });
  }

  watchSubscription() {
    this.router.navigate(['/player', {sub_id: this.subscription.id}])
  }

}
