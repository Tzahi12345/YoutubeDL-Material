import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { ModifyPlaylistComponent } from './modify-playlist.component';

describe('ModifyPlaylistComponent', () => {
  let component: ModifyPlaylistComponent;
  let fixture: ComponentFixture<ModifyPlaylistComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ ModifyPlaylistComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ModifyPlaylistComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
