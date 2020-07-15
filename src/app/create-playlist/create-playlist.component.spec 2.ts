import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { CreatePlaylistComponent } from './create-playlist.component';

describe('CreatePlaylistComponent', () => {
  let component: CreatePlaylistComponent;
  let fixture: ComponentFixture<CreatePlaylistComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ CreatePlaylistComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(CreatePlaylistComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
