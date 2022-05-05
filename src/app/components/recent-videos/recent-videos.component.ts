import { Component, OnInit, ViewChild } from '@angular/core';
import { PostsService } from 'app/posts.services';
import { Router } from '@angular/router';
import { FileType } from '../../../api-types';
import { MatPaginator } from '@angular/material/paginator';
import { Subject } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';

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
  file_count = 10;
  searchChangedSubject: Subject<string> = new Subject<string>();
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
  fileTypeFilter = 'both';
  
  playlists = null;

  pageSize = 10;
  paged_data = null;

  @ViewChild('paginator') paginator: MatPaginator

  constructor(public postsService: PostsService, private router: Router) {
    // get cached file count
    if (localStorage.getItem('cached_file_count')) {
      this.cached_file_count = +localStorage.getItem('cached_file_count') <= 10 ? +localStorage.getItem('cached_file_count') : 10;
      
      this.loading_files = Array(this.cached_file_count).fill(0);
    }
  }

  ngOnInit(): void {
    if (this.postsService.initialized) {
      this.getAllFiles();
      this.getAllPlaylists();
    }

    this.postsService.service_initialized.subscribe(init => {
      if (init) {
        this.getAllFiles();
        this.getAllPlaylists();
      }
    });

    this.postsService.files_changed.subscribe(changed => {
      if (changed) {
        this.getAllFiles();
      }
    });

    this.postsService.playlists_changed.subscribe(changed => {
      if (changed) {
        this.getAllPlaylists();
      }
    });

    // set filter property to cached value
    const cached_filter_property = localStorage.getItem('filter_property');
    if (cached_filter_property && this.filterProperties[cached_filter_property]) {
      this.filterProperty = this.filterProperties[cached_filter_property];
    }

    // set file type filter to cached value
    const cached_file_type_filter = localStorage.getItem('file_type_filter');
    if (cached_file_type_filter) {
      this.fileTypeFilter = cached_file_type_filter;
    }

    const sort_order = localStorage.getItem('recent_videos_sort_order');

    if (sort_order) {
      this.descendingMode = sort_order === 'descending';
    }

    this.searchChangedSubject
      .debounceTime(500)
      .pipe(distinctUntilChanged()
      ).subscribe(model => {
        if (model.length > 0) {
          this.search_mode = true;
        } else {
          this.search_mode = false;
        }
        this.getAllFiles();
      });
  }

  getAllPlaylists() {
    this.postsService.getPlaylists().subscribe(res => {
      this.playlists = res['playlists'];
    });
  }

  // search

  onSearchInputChanged(newvalue) {
    this.normal_files_received = false;
    this.searchChangedSubject.next(newvalue);
  }

  filterOptionChanged(value) {
    localStorage.setItem('filter_property', value['key']);
    this.getAllFiles();
  }

  fileTypeFilterChanged(value) {
    localStorage.setItem('file_type_filter', value);
    this.getAllFiles();
  }

  toggleModeChange() {
    this.descendingMode = !this.descendingMode;
    localStorage.setItem('recent_videos_sort_order', this.descendingMode ? 'descending' : 'ascending');
    this.getAllFiles();
  }

  // get files

  getAllFiles(cache_mode = false) {
    this.normal_files_received = cache_mode;
    const current_file_index = (this.paginator?.pageIndex ? this.paginator.pageIndex : 0)*this.pageSize;
    const sort = {by: this.filterProperty['property'], order: this.descendingMode ? -1 : 1};
    const range = [current_file_index, current_file_index + this.pageSize];
    this.postsService.getAllFiles(sort, range, this.search_mode ? this.search_text : null, this.fileTypeFilter).subscribe(res => {
      this.file_count = res['file_count'];
      this.paged_data = res['files'];
      for (let i = 0; i < this.paged_data.length; i++) {
        const file = this.paged_data[i];
        file.duration = typeof file.duration !== 'string' ? file.duration : this.durationStringToNumber(file.duration);
      }

      // set cached file count for future use, note that we convert the amount of files to a string
      localStorage.setItem('cached_file_count', '' + this.file_count);

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
        // !new_tab ? this.router.navigate(['/player', {name: file.id,
        //                                   url: file.requested_formats ? file.requested_formats[0].url : file.url}])
        //         : window.open(`/#/player;name=${file.id};url=${file.requested_formats ? file.requested_formats[0].url : file.url}`);
      } else {
        // normal subscriptions
        !new_tab ? this.router.navigate(['/player', {uid: file.uid,
                                          type: file.isAudio ? 'audio' : 'video'}]) 
                 : window.open(`/#/player;uid=${file.uid};type=${file.isAudio ? 'audio' : 'video'}`);
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
    const type = (file.isAudio ? 'audio' : 'video') as FileType;
    const ext = type === 'audio' ? '.mp3' : '.mp4'
    const sub = this.postsService.getSubscriptionByID(file.sub_id);
    this.postsService.downloadFileFromServer(file.uid).subscribe(res => {
          const blob: Blob = res;
          saveAs(blob, file.id + ext);
        }, err => {
          console.log(err);
      });
  }

  downloadNormalFile(file) {
    const type = (file.isAudio ? 'audio' : 'video') as FileType;
    const ext = type === 'audio' ? '.mp3' : '.mp4'
    const name = file.id;
    this.downloading_content[type][name] = true;
    this.postsService.downloadFileFromServer(file.uid).subscribe(res => {
      this.downloading_content[type][name] = false;
      const blob: Blob = res;
      saveAs(blob, decodeURIComponent(name) + ext);

      if (!this.postsService.config.Extra.file_manager_enabled) {
        // tell server to delete the file once downloaded
        this.postsService.deleteFile(file.uid).subscribe(delRes => {
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
      this.deleteSubscriptionFile(file, blacklistMode);
    } else {
      this.deleteNormalFile(file, blacklistMode);
    }
  }

  deleteNormalFile(file, blacklistMode = false) {
    this.postsService.deleteFile(file.uid, blacklistMode).subscribe(result => {
      if (result) {
        this.postsService.openSnackBar('Delete success!', 'OK.');
        this.removeFileCard(file);
      } else {
        this.postsService.openSnackBar('Delete failed!', 'OK.');
      }
    }, err => {
      this.postsService.openSnackBar('Delete failed!', 'OK.');
    });
  }

  deleteSubscriptionFile(file, blacklistMode = false) {
    if (blacklistMode) {
      this.deleteForever(file);
    } else {
      this.deleteAndRedownload(file);
    }
  }

  deleteAndRedownload(file) {
    const sub = this.postsService.getSubscriptionByID(file.sub_id);
    this.postsService.deleteSubscriptionFile(sub, file.id, false, file.uid).subscribe(res => {
      this.postsService.openSnackBar(`Successfully deleted file: '${file.id}'`);
      this.removeFileCard(file);
    });
  }

  deleteForever(file) {
    const sub = this.postsService.getSubscriptionByID(file.sub_id);
    this.postsService.deleteSubscriptionFile(sub, file.id, true, file.uid).subscribe(res => {
      this.postsService.openSnackBar(`Successfully deleted file: '${file.id}'`);
      this.removeFileCard(file);
    });
  }

  removeFileCard(file_to_remove) {
    const index = this.paged_data.map(e => e.uid).indexOf(file_to_remove.uid);
    this.paged_data.splice(index, 1);
    this.getAllFiles(true);
  }

  addFileToPlaylist(info_obj) {
    const file = info_obj['file'];
    const playlist_id = info_obj['playlist_id'];
    const playlist = this.playlists.find(potential_playlist => potential_playlist['id'] === playlist_id);
    this.postsService.addFileToPlaylist(playlist_id, file['uid']).subscribe(res => {
      if (res['success']) {
        this.postsService.openSnackBar(`Successfully added ${file.title} to ${playlist.title}!`);
        this.postsService.playlists_changed.next(true);
      } else {
        this.postsService.openSnackBar(`Failed to add ${file.title} to ${playlist.title}! Unknown error.`);
      }
    }, err => {
      console.error(err);
      this.postsService.openSnackBar(`Failed to add ${file.title} to ${playlist.title}! See browser console for error.`);
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
    for (let i = dur_str_parts.length - 1; i >= 0; i--) {
      num_sum += parseInt(dur_str_parts[i]) * (60 ** (dur_str_parts.length - 1 - i));
    }
    return num_sum;
  }

  pageChangeEvent(event) {
    this.pageSize = event.pageSize;
    this.loading_files = Array(this.pageSize).fill(0);
    this.getAllFiles();
  }
}
