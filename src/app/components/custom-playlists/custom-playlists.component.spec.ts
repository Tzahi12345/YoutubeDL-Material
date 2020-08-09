import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { CustomPlaylistsComponent } from './custom-playlists.component';

describe('CustomPlaylistsComponent', () => {
  let component: CustomPlaylistsComponent;
  let fixture: ComponentFixture<CustomPlaylistsComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ CustomPlaylistsComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(CustomPlaylistsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
