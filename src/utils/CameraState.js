import { mat4, vec3, vec4 } from 'wgpu-matrix'

const degToRad = d => d * Math.PI / 180;

export class CameraState {
    constructor(maxSize, w, h, gpuDevice, canvas, vCamMat) {
        this.gpuDevice = gpuDevice
        this.canvas = canvas
        this.vCamMat = vCamMat

        this._updateFlag = true;

        this._position = vec4.create(0, 0, maxSize * 2, 1);
        this.position = this._position.subarray(0, 3);  //共用一块buffer，上传时不用重复创建新buffer
        this.target = vec3.create(0, 0, 0);
        this.up = vec3.create(0, 1, 0); 

        this.fov_deg = 70;
        this.fov = degToRad(this.fov_deg);
        this.f = 1 / Math.tan(this.fov / 2);
        this.aspect = 1;
        this.near = 0.1;
        this.far = maxSize * 6.5;
        
        this.rotationSpeed = 0.005;
        this.zoomSpeed = 0.01;
        
        
        this._viewMatrix = mat4.identity();
        this._projectionMatrix = mat4.identity();
        this._viewProjMatrix = mat4.identity();

        this.handleResize(w, h)

        this._updateViewMatrix();
        this._updateProjMatrix();
        this.updateViewProjMatrix();
    }

    handleRotation(deltaX, deltaY) {
        const radius = Math.sqrt(
            Math.pow(this.position[0] - this.target[0], 2) +
            Math.pow(this.position[1] - this.target[1], 2) +
            Math.pow(this.position[2] - this.target[2], 2)
        );

        let theta = Math.atan2(
            this.position[0] - this.target[0], 
            this.position[2] - this.target[2]
        );
        let phi = Math.acos(
            (this.position[1] - this.target[1]) / radius
        );

        theta -= deltaX * this.rotationSpeed;
        phi = Math.max(0.1, Math.min(Math.PI - 0.1, 
                      phi - deltaY * this.rotationSpeed));

        this.position[0] = this.target[0] + radius * Math.sin(phi) * Math.sin(theta);
        this.position[1] = this.target[1] + radius * Math.cos(phi);
        this.position[2] = this.target[2] + radius * Math.sin(phi) * Math.cos(theta);

        this._updateViewMatrix();
    }

    handleZoom(delta) {
        const zoomAmount = delta * this.zoomSpeed;

        this.fov_deg += zoomAmount;
        this.fov_deg = Math.min(Math.max(1,this.fov_deg), 100)
        this.fov = degToRad(this.fov_deg);
        this.f = 1 / Math.tan(this.fov / 2);

        this._updateProjMatrix();
    }

    handleResize(w,h) {
        this.canvas.width = w;
        this.canvas.height = h;
        this.aspect = w / h;
        this._projectionMatrix[0] = this.f / this.aspect;
        this._updateFlag = true;
    }

    _updateViewMatrix() {
        mat4.lookAt(
            this.position,
            this.target,
            this.up,
            this._viewMatrix
        );
        this._updateFlag = true;
    }

    _updateProjMatrix() {
        mat4.perspective(
            this.fov,
            this.aspect,
            this.near,
            this.far,
            this._projectionMatrix
        );
        this._updateFlag = true;
    }

    updateViewProjMatrix() {
        if (!this._updateFlag) return
        this._updateFlag = false

        mat4.multiply(
            this._projectionMatrix,
            this._viewMatrix,
            this._viewProjMatrix
        );

        this.gpuDevice.queue.writeBuffer(
            this.vCamMat,
            0,
            this._viewProjMatrix,
        );
        this.gpuDevice.queue.writeBuffer(
            this.vCamMat,
            16 * 4, 
            this._position,
        );
    }
}