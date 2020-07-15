import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { FileCardComponent } from './file-card.component';

describe('FileCardComponent', () => {
  let component: FileCardComponent;
  let fixture: ComponentFixture<FileCardComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ FileCardComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(FileCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
