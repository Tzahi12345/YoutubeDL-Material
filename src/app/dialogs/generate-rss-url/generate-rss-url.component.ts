import { Component } from '@angular/core';
import { Router, UrlSerializer } from '@angular/router';
import { Sort } from 'api-types';
import { PostsService } from 'app/posts.services';
import { Clipboard } from '@angular/cdk/clipboard';

@Component({
  selector: 'app-generate-rss-url',
  templateUrl: './generate-rss-url.component.html',
  styleUrls: ['./generate-rss-url.component.scss']
})
export class GenerateRssUrlComponent {
  usersList = null;
  userFilter = '';
  titleFilter = '';
  subscriptionFilter = '';
  fileTypeFilter = 'both';
  itemLimit = null;
  favoriteFilter = false;
  url = '';
  baseURL = `${this.postsService.config.Host.url}:${this.postsService.config.Host.port}/api/rss`
  sortProperty = 'registered'
  descendingMode = true
  constructor(public postsService: PostsService, private router: Router, private serializer: UrlSerializer, private clipboard: Clipboard) {
    if (postsService.isLoggedIn) {
      this.usersList = [this.postsService.user];
      this.userFilter = postsService.user.uid;
      this.getUsers();
    }
    this.url = this.baseURL;
    this.rebuildURL();
  }

  getUsers() {
    this.postsService.getUsers().subscribe(res => {
      this.usersList = res['users'];
      console.log(this.usersList)
    });
  }

  sortOptionChanged(sort: Sort) {
    this.descendingMode = sort['order'] === -1;
    this.sortProperty = sort['by'];
    this.rebuildURL();
  }

  rebuildURL() {
    // code can be cleaned up
    const params = {};

    if (this.userFilter) {
      params['uuid'] = encodeURIComponent(this.userFilter);
    }

    if (this.titleFilter) {
      params['text_search'] = encodeURIComponent(this.titleFilter);
    }

    if (this.subscriptionFilter) {
      params['sub_id'] = encodeURIComponent(this.subscriptionFilter);
    }

    if (this.itemLimit) {
      params['range'] = [0, this.itemLimit];
    }

    if (this.favoriteFilter) {
      params['favorite_filter'] = this.favoriteFilter;
    }

    if (this.fileTypeFilter !== 'both') {
      params['file_type_filter'] = this.fileTypeFilter;
    }

    if (this.sortProperty !== 'registered' || !this.descendingMode) {
      params['sort'] = encodeURIComponent(JSON.stringify({by: this.sortProperty, order: this.descendingMode ? -1 : 1}));
    }

    const tree = this.router.createUrlTree(['..'], { queryParams: params });

    this.url = `${this.baseURL}${this.serializer.serialize(tree)}`;
  }

  copyURL() {
    this.clipboard.copy(this.url);
    this.postsService.openSnackBar('URL copied!');
  }
}
