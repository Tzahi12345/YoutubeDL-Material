import { Component, ViewChild } from '@angular/core';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { Archive } from 'api-types/models/Archive';
import { PostsService } from 'app/posts.services';

@Component({
  selector: 'app-archive-viewer',
  templateUrl: './archive-viewer.component.html',
  styleUrls: ['./archive-viewer.component.scss']
})
export class ArchiveViewerComponent {
  archives = null;
  displayedColumns: string[] = ['timestamp', 'title', 'id', 'extractor'];
  dataSource = null;
  archives_retrieved = false;

  @ViewChild(MatSort) sort: MatSort;
  
  constructor(private postsService: PostsService) {

  }

  filterSelectionChanged(value: string): void {
    this.getArchives(value);
  }

  getArchives(sub_id: string = null): void {
    this.postsService.getArchives(sub_id).subscribe(res => {
      if (res['archives'] !== null 
        && res['archives'] !== undefined
        && JSON.stringify(this.archives) !== JSON.stringify(res['archives'])) {
          this.archives = res['archives']
          this.dataSource = new MatTableDataSource<Archive>(this.archives);
          this.dataSource.sort = this.sort;
      } else {
        // failed to get downloads
      }
    });
  }
}
