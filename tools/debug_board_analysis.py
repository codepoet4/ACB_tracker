import sys
import numpy as np
import cv2
from app.board_detector import BoardDetector

def main(path):
    with open(path,'rb') as f:
        data=f.read()
    # read image
    nparr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    board_coords = BoardDetector._detect_board(img)
    board_img = BoardDetector._crop_board(img, board_coords)
    gray = cv2.cvtColor(board_img, cv2.COLOR_BGR2GRAY)
    h,w=gray.shape
    sq=w//8
    print(f'board size {w}x{h}, square {sq}')
    for r in range(8):
        row=[]
        for c in range(8):
            y0=r*sq; y1=(r+1)*sq; x0=c*sq; x1=(c+1)*sq
            sqimg=gray[y0:y1,x0:x1]
            mean=np.mean(sqimg); std=np.std(sqimg)
            edges=cv2.Canny(sqimg,40,120)
            edge_ratio=np.sum(edges>0)/(sqimg.size)
            # contours
            contours,_=cv2.findContours(edges,cv2.RETR_TREE,cv2.CHAIN_APPROX_SIMPLE)
            max_area=0
            if contours:
                max_area=max(cv2.contourArea(cnt) for cnt in contours)
            row.append({'mean':round(mean,1),'std':round(std,1),'edge_ratio':round(edge_ratio,4),'max_area':int(max_area)})
        print(row)

if __name__=='__main__':
    if len(sys.argv)<2:
        print('usage')
    else:
        main(sys.argv[1])
