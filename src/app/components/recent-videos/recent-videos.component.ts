import { Component, OnInit } from '@angular/core';
import { PostsService } from 'app/posts.services';
import { Router } from '@angular/router';

@Component({
  selector: 'app-recent-videos',
  templateUrl: './recent-videos.component.html',
  styleUrls: ['./recent-videos.component.scss']
})
export class RecentVideosComponent implements OnInit {

  cached_file_count = 0;
  loading_files = null;

  normal_files_received = false;
  subscription_files_received = false;
  files: any[] = null;
  filtered_files: any[] = null;
  downloading_content = {'video': {}, 'audio': {}};
  search_mode = false;
  search_text = '';
  searchIsFocused = false;
  descendingMode = true;
  filterProperties = {
    'registered': {
      'key': 'registered',
      'label': 'Download Date',
      'property': 'registered'
    },
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

  constructor(public postsService: PostsService, private router: Router) {
    // get cached file count
    if (localStorage.getItem('cached_file_count')) {
      this.cached_file_count = +localStorage.getItem('cached_file_count');
      this.loading_files = Array(this.cached_file_count).fill(0);
    }
  }

  ngOnInit(): void {
    if (this.postsService.initialized) {
      this.getAllFiles();
    }

    this.postsService.service_initialized.subscribe(init => {
      if (init) {
        this.getAllFiles();
      }
    });


    // set filter property to cached
    const cached_filter_property = localStorage.getItem('filter_property');
    if (cached_filter_property && this.filterProperties[cached_filter_property]) {
      this.filterProperty = this.filterProperties[cached_filter_property];
    }
  }

  // search

  onSearchInputChanged(newvalue) {
    if (newvalue.length > 0) {
      this.search_mode = true;
      this.filterFiles(newvalue);
    } else {
      this.search_mode = false;
      this.filtered_files = this.files;
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

  // get files

  getAllFiles() {
    this.normal_files_received = false;
    this.postsService.getAllFiles().subscribe(res => {
      this.files = res['files'];
      this.files.forEach(file => {
        file.duration = typeof file.duration !== 'string' ? file.duration : this.durationStringToNumber(file.duration);
      });
      this.files.sort(this.sortFiles);
      if (this.search_mode) {
        this.filterFiles(this.search_text);
      } else {
        this.filtered_files = this.files;
      }
      this.filterByProperty(this.filterProperty['property']);

      // set cached file count for future use, note that we convert the amount of files to a string
      localStorage.setItem('cached_file_count', '' + this.files.length);

      this.normal_files_received = true;
    });
  }

  // navigation

  goToFile(info_obj) {
    const file = info_obj['file'];
    const event = info_obj['event'];
    if (this.postsService.config['Extra']['download_only_mode']) {
      this.downloadFile(file);
    } else {
      this.navigateToFile(file, event.ctrlKey);
    }
  }

  navigateToFile(file, new_tab) {
    localStorage.setItem('player_navigator', this.router.url);
    if (file.sub_id) {
      const sub = this.postsService.getSubscriptionByID(file.sub_id);
      if (sub.streamingOnly) {
        // streaming only mode subscriptions
        !new_tab ? this.router.navigate(['/player', {name: file.id,
                                          url: file.requested_formats ? file.requested_formats[0].url : file.url}])
                : window.open(`/#/player;name=${file.id};url=${file.requested_formats ? file.requested_formats[0].url : file.url}`);
      } else {
        // normal subscriptions
        !new_tab ? this.router.navigate(['/player', {fileNames: file.id,
                                          type: file.isAudio ? 'audio' : 'video', subscriptionName: sub.name,
                                          subPlaylist: sub.isPlaylist}]) 
                 : window.open(`/#/player;fileNames=${file.id};type=${file.isAudio ? 'audio' : 'video'};subscriptionName=${sub.name};subPlaylist=${sub.isPlaylist}`);
      }
    } else {
      // normal files
      !new_tab ? this.router.navigate(['/player', {type: file.isAudio ? 'audio' : 'video', uid: file.uid}])
               : window.open(`/#/player;type=${file.isAudio ? 'audio' : 'video'};uid=${file.uid}`);
    }
  }

  goToSubscription(file) {
    this.router.navigate(['/subscription', {id: file.sub_id}]);
  }

  // downloading

  downloadFile(file) {
    if (file.sub_id) {
      this.downloadSubscriptionFile(file);
    } else {
      this.downloadNormalFile(file);
    }
  }

  downloadSubscriptionFile(file) {
    const type = file.isAudio ? 'audio' : 'video';
    const ext = type === 'audio' ? '.mp3' : '.mp4'
    const sub = this.postsService.getSubscriptionByID(file.sub_id);
    this.postsService.downloadFileFromServer(file.id, type, null, null, sub.name, sub.isPlaylist,
      this.postsService.user ? this.postsService.user.uid : null, null).subscribe(res => {
          const blob: Blob = res;
          saveAs(blob, file.id + ext);
        }, err => {
          console.log(err);
      });
  }

  downloadNormalFile(file) {
    const type = file.isAudio ? 'audio' : 'video';
    const ext = type === 'audio' ? '.mp3' : '.mp4'
    const name = file.id;
    this.downloading_content[type][name] = true;
    this.postsService.downloadFileFromServer(name, type).subscribe(res => {
      this.downloading_content[type][name] = false;
      const blob: Blob = res;
      saveAs(blob, decodeURIComponent(name) + ext);

      if (!this.postsService.config.Extra.file_manager_enabled) {
        // tell server to delete the file once downloaded
        this.postsService.deleteFile(name, type).subscribe(delRes => {
          // reload mp4s
          this.getAllFiles();
        });
      }
    });
  }

  // deleting

  deleteFile(args) {
    const file = args.file;
    const index = args.index;
    const blacklistMode = args.blacklistMode;

    if (file.sub_id) {
      this.deleteSubscriptionFile(file, index, blacklistMode);
    } else {
      this.deleteNormalFile(file, index, blacklistMode);
    }
  }

  deleteNormalFile(file, index, blacklistMode = false) {
    this.postsService.deleteFile(file.uid, file.isAudio ? 'audio' : 'video', blacklistMode).subscribe(result => {
      if (result) {
        this.postsService.openSnackBar('Delete success!', 'OK.');
        this.files.splice(index, 1);
      } else {
        this.postsService.openSnackBar('Delete failed!', 'OK.');
      }
    }, err => {
      this.postsService.openSnackBar('Delete failed!', 'OK.');
    });
  }

  deleteSubscriptionFile(file, index, blacklistMode = false) {
    if (blacklistMode) {
      this.deleteForever(file, index);
    } else {
      this.deleteAndRedownload(file, index);
    }
  }

  deleteAndRedownload(file, index) {
    const sub = this.postsService.getSubscriptionByID(file.sub_id);
    this.postsService.deleteSubscriptionFile(sub, file.id, false, file.uid).subscribe(res => {
      this.postsService.openSnackBar(`Successfully deleted file: '${file.id}'`);
      this.files.splice(index, 1);
    });
  }

  deleteForever(file, index) {
    const sub = this.postsService.getSubscriptionByID(file.sub_id);
    this.postsService.deleteSubscriptionFile(sub, file.id, true, file.uid).subscribe(res => {
      this.postsService.openSnackBar(`Successfully deleted file: '${file.id}'`);
      this.files.splice(index, 1);
    });
  }

  // sorting and filtering

  sortFiles(a, b) {
    // uses the 'registered' flag as the timestamp
    const result = b.registered - a.registered;
    return result;
  }
  
  durationStringToNumber(dur_str) {
    let num_sum = 0;
    const dur_str_parts = dur_str.split(':');
    for (let i = dur_str_parts.length-1; i >= 0; i--) {
      num_sum += parseInt(dur_str_parts[i])*(60**(dur_str_parts.length-1-i));
    }
    return num_sum;
  }
}
