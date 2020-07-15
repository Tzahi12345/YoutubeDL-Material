import { TestBed } from '@angular/core/testing';

import { YoutubeSearchService } from './youtube-search.service';

describe('YoutubeSearchService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: YoutubeSearchService = TestBed.get(YoutubeSearchService);
    expect(service).toBeTruthy();
  });
});
