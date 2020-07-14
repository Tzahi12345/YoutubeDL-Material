import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { UnifiedFileCardComponent } from './unified-file-card.component';

describe('UnifiedFileCardComponent', () => {
  let component: UnifiedFileCardComponent;
  let fixture: ComponentFixture<UnifiedFileCardComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ UnifiedFileCardComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(UnifiedFileCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
