export const _volumeShaderCode = `
    @group(0) @binding(0) var volumeTex: texture_3d<f32>;
    @group(0) @binding(1) var<uniform> camMat: CamMatUni;
    @group(0) @binding(2) var<uniform> boxSize: vec3f;
    @group(0) @binding(3) var sampler0: sampler;
    @group(0) @binding(4) var<uniform> maxP: f32;
    @group(0) @binding(5) var<uniform> minP: f32;
    @group(0) @binding(6) var<uniform> baseP: f32;
    @group(0) @binding(7) var v: texture_3d<f32>;

    struct CamMatUni {
        vpMat:  mat4x4f,
        camPos: vec4f,
    };

    struct VOut {
        @builtin(position) position: vec4f,
        @location(0) fragPos: vec3f,
    }

    fn colorTransfer(scalarValue: f32, leftNor: f32, rightNor: f32, nor: f32) -> vec4f {

        let maxOpacity = 0.1f;
        var leftMaxOpacity = min(nor, maxOpacity);
        var rightMaxOpacity = min(1 - nor, maxOpacity);

        let inLeft = step(scalarValue, leftNor); // left <= right -> 1.0f
        let inRight = step(rightNor, scalarValue);
        
        let opacityLeft = (-leftMaxOpacity / leftNor) * scalarValue + leftMaxOpacity;
        let opacityRight = rightMaxOpacity * (scalarValue - rightNor) / (1.0f - rightNor);
        let opacity = inLeft * opacityLeft + inRight * opacityRight;
        
        return vec4((nor - scalarValue) * inLeft / nor, 0, (scalarValue - nor) * inRight / (1.0f - nor), opacity);
    }

    fn surfacePointColor(position: vec3f, startP: vec3f, sourceC: vec3f) -> vec4f {
        var lineHalfWidth = 0.5f;
        var gridWidth = 10f;

        var relPos = position - startP;
        var relRemain = relPos % gridWidth;
        var isValid = step(vec3f(gridWidth), relPos);

        var isLineNear = step(vec3f(gridWidth - lineHalfWidth), relRemain) + step(relRemain, vec3f(lineHalfWidth));
        isLineNear = isLineNear * isValid;

        var lineFactor = min(1.0f, isLineNear.x + isLineNear.y + isLineNear.z);

        return vec4f(sourceC.rgb, 0f) * (1 - lineFactor) + vec4f(0,0,0,0.8) * lineFactor;
    }

    @vertex
    fn v_main(@location(0) position: vec3f) -> VOut {
        var out : VOut;
        out.fragPos = position;
        out.position = camMat.vpMat * vec4f(position, 1);
        return out;
    }

    @diagnostic(off,derivative_uniformity)
    @fragment 
    fn f_main(@location(0) v_fragPos: vec3f) -> @location(0) vec4f {
        let bgC = vec3f(224,241,255)/255;
        //let baseC = vec3f(20,180,15)/255;
        let gamma = 2.2f;

        let trueBaseP = maxP - minP;
        let nor = (0 - minP) / trueBaseP;
        let leftNor = nor - 0.0001f;    
        let rightNor = nor + 0.0001f;

        let minCP = vec4f(0);
        let maxCP = boxSize;
        let stepLen = 1.0f;

        let fragPos = v_fragPos + maxCP / 2;
        let camPos = camMat.camPos.xyz + maxCP / 2;
        let rayDir = normalize(fragPos - camPos);

        let tx0 = (maxCP.x - camPos.x) / (0.00000001f + rayDir.x);
        let tx1 = (minCP.x - camPos.x) / (0.00000001f + rayDir.x);
        let txmin = min(tx0,tx1);
        let txmax = max(tx0,tx1);

        let ty0 = (maxCP.y - camPos.y) / (0.00000001f + rayDir.y);
        let ty1 = (minCP.y - camPos.y) / (0.00000001f + rayDir.y);
        let tymin = min(ty0,ty1);
        let tymax = max(ty0,ty1);

        let tz0 = (maxCP.z - camPos.z) / (0.00000001f + rayDir.z);
        let tz1 = (minCP.z - camPos.z) / (0.00000001f + rayDir.z);
        let tzmin = min(tz0,tz1);
        let tzmax = max(tz0,tz1);

        let tmin=max(txmin,max(tymin,tzmin));
        let tmax=min(txmax,min(tymax,tzmax));

        if(tmin <= 0 || tmin >= tmax){
            return vec4f(bgC.rgb, 1.0f);
        }

        var start = camPos + tmin * rayDir;
        var end = camPos + tmax * rayDir;
        
        let rayLen = length(end - start);

        var gridStartP = (maxCP % 10) / 2 - 1f;

        var frontC = surfacePointColor(start, gridStartP, vec3f(0));
        var backC = surfacePointColor(end, gridStartP, vec3f(0));

        var gridOpacity = 0.8f;
        //var resultC = frontC;

        //var resultC = vec4f(baseC.rgb, 0f);
        var resultC = vec4f(0f);

        var stepVec = stepLen * rayDir;

        var samplePointCoord = vec3f(0);
        var scalarValue = 0f;
        var vValue = 0f;
        
        var curColorTransfer = vec4f(0.f);
        var vA = 1.0f;
        
        let maxStep = i32(ceil(rayLen / stepLen));

        for(var i = 0; i < maxStep; i++) {

            samplePointCoord = vec3f(
                start.x/boxSize.x,
                start.y/boxSize.y,
                start.z/boxSize.z
            );
            
            scalarValue = textureSample(
                volumeTex, 
                sampler0, 
                samplePointCoord,
            ).r;

            scalarValue = (scalarValue * baseP - minP) / trueBaseP;

            vValue = textureSample(
                v, 
                sampler0, 
                samplePointCoord,
            ).r;

            vA = vA + (1-vA)*(1- vValue * 0.75);
            // vA = vA + (1-vA)*(1- vValue); 

            if(scalarValue >= leftNor && scalarValue <= rightNor)
            {
                start += stepVec;
                continue;
            }
        
            curColorTransfer = colorTransfer(scalarValue, leftNor, rightNor, nor);
                
            var tempFactor = (1-resultC.a)*curColorTransfer.a;
            resultC = vec4f(
                resultC.rgb + tempFactor * curColorTransfer.rgb,
                resultC.a + tempFactor
            );

            if(resultC.a >= 1.0) { break; }
        
            start += stepVec;
        }

        resultC = vec4(
            pow(resultC.a*resultC.rgb + (1.0f-resultC.a)*bgC.rgb, vec3f(1.0f/gamma)),
            vA + resultC.a * (1 - vA),
        );
        
        return resultC;
    }

`

export const volumeShaderCode = `
    @group(0) @binding(0) var volumeTex: texture_3d<f32>;
    @group(0) @binding(1) var<uniform> camMat: CamMatUni;
    @group(0) @binding(2) var<uniform> boxSize: vec3f;
    @group(0) @binding(3) var sampler0: sampler;
    @group(0) @binding(4) var<uniform> maxP: f32;
    @group(0) @binding(5) var<uniform> minP: f32;
    @group(0) @binding(6) var<uniform> baseP: f32;
    @group(0) @binding(7) var v: texture_3d<f32>;
    @group(0) @binding(8) var<uniform> thickness: f32;

    struct CamMatUni {
        vpMat:  mat4x4f,
        camPos: vec4f,
    };

    struct VOut {
        @builtin(position) position: vec4f,
        @location(0) fragPos: vec3f,
    }

    fn colorTransfer(scalarValue: f32, leftNor: f32, rightNor: f32, nor: f32, maxOpacity: f32) -> vec4f {

        var leftMaxOpacity = min(nor, maxOpacity);
        var rightMaxOpacity = min(1 - nor, maxOpacity);

        let inLeft = step(scalarValue, leftNor); // left <= right -> 1.0f
        let inRight = step(rightNor, scalarValue);
        
        let opacityLeft = (-leftMaxOpacity / leftNor) * scalarValue + leftMaxOpacity;
        let opacityRight = rightMaxOpacity * (scalarValue - rightNor) / (1.0f - rightNor);
        let opacity = inLeft * opacityLeft + inRight * opacityRight;

        return vec4(1.0f - scalarValue, 0, scalarValue, opacity);
    }

    @vertex
    fn v_main(@location(0) position: vec3f) -> VOut {
        var out : VOut;
        out.fragPos = position;
        out.position = camMat.vpMat * vec4f(position, 1);
        return out;
    }

    @diagnostic(off,derivative_uniformity)
    @fragment 
    fn f_main(@location(0) v_fragPos: vec3f) -> @location(0) vec4f {
        let bgC = vec3f(66,125,66)/255;
        let gamma = 2.2f;

        let trueBaseP = maxP - minP;
        let nor = (0 - minP) / trueBaseP;
        let leftNor = nor - 0.0001f;    
        let rightNor = nor + 0.0001f;

        let minCP = vec3f(thickness);
        let maxCP = vec3f(boxSize.x, boxSize.y, boxSize.z) - minCP;
        let stepLen = 0.2f;

        let sizeFactor = length(vec3f(boxSize.x / 256f, boxSize.y / 200f, boxSize.z / 200f));
        let oFactor = stepLen / sizeFactor;
        let vMaxOpacity = 0.03f * oFactor;
        let vBaseMaxOpacity = 0.028f * oFactor;
        let wMaxOpacity = 0.225f * oFactor;

        let fragPos = v_fragPos + boxSize / 2;
        let camPos = camMat.camPos.xyz + boxSize / 2;
        let rayDir = normalize(fragPos - camPos);

        let tx0 = (maxCP.x - camPos.x) / (0.00000001f + rayDir.x);
        let tx1 = (minCP.x - camPos.x) / (0.00000001f + rayDir.x);
        let txmin = min(tx0,tx1);
        let txmax = max(tx0,tx1);

        let ty0 = (maxCP.y - camPos.y) / (0.00000001f + rayDir.y);
        let ty1 = (minCP.y - camPos.y) / (0.00000001f + rayDir.y);
        let tymin = min(ty0,ty1);
        let tymax = max(ty0,ty1);

        let tz0 = (maxCP.z - camPos.z) / (0.00000001f + rayDir.z);
        let tz1 = (minCP.z - camPos.z) / (0.00000001f + rayDir.z);
        let tzmin = min(tz0,tz1);
        let tzmax = max(tz0,tz1);

        let tmin=max(txmin,max(tymin,tzmin));
        let tmax=min(txmax,min(tymax,tzmax));

        if(tmin <= 0 || tmin >= tmax){
            return vec4f(224,241,255,255)/255;
        }
        
        var start = camPos + tmin * rayDir;
        var end = camPos + tmax * rayDir;
        
        let rayLen = length(end - start);

        var resultC = vec4f(0f);

        var stepVec = stepLen * rayDir;

        var samplePointCoord = vec3f(0);
        var scalarValue = 0f;
        var vValue = 0f;
        
        var curColorTransfer = vec4f(0.f);
        var vA = 1.0f;
        
        let maxStep = i32(ceil(rayLen / stepLen));

        for(var i = 0; i < maxStep; i++) {

            samplePointCoord = vec3f(
                start.x/boxSize.x,
                1-start.y/boxSize.y,
                start.z/boxSize.z
            );
            
            scalarValue = textureSample(
                volumeTex, 
                sampler0, 
                samplePointCoord,
            ).r;

            scalarValue = min(1.0f, (scalarValue * baseP - minP) / trueBaseP);

            vValue = textureSample(
                v, 
                sampler0, 
                samplePointCoord,
            ).r * 2;

            var isVBorder = step(1.5f, vValue);
            var vTempFactor = (1-resultC.a)*(vValue*vBaseMaxOpacity*(1-isVBorder) + vMaxOpacity*isVBorder);
            resultC = vec4f(
                resultC.rgb + vTempFactor * bgC.rgb,
                resultC.a + vTempFactor
            );

            if(scalarValue >= leftNor && scalarValue <= rightNor)
            {
                start += stepVec;
                continue;
            }
        
            curColorTransfer = colorTransfer(scalarValue, leftNor, rightNor, nor, wMaxOpacity);
                
            var tempFactor = (1-resultC.a)*curColorTransfer.a;
            resultC = vec4f(
                resultC.rgb + tempFactor * curColorTransfer.rgb,
                resultC.a + tempFactor
            );

            if(resultC.a >= 1.0) { break; }
        
            start += stepVec;
        }

        resultC = vec4f(
            pow(resultC.a*resultC.rgb + (1.0f-resultC.a)*bgC.rgb, vec3f(1.0f/gamma)),
            resultC.a,
        );
        
        return resultC;
    }

`

export const axisShaderCode = `
    @group(0) @binding(0) var<uniform> camMat: CamMatUni;

    struct CamMatUni {
        vpMat:  mat4x4f,
        camPos: vec4f,
    };

    struct Output {
        @builtin(position) position: vec4f,
        @location(0) color: vec4f,
    }

    @vertex
    fn v_main(
        @builtin(instance_index) axis : u32,
        @location(0) position: f32,
    ) -> Output {
        var output: Output;
        output.position = vec4f(0,0,0,1);
        output.color = vec4f(0,0,0,1);

        output.position[axis] = position;
        output.position = camMat.vpMat * output.position;

        output.color[axis] = 1;

        return output;
    }

    @fragment 
    fn f_main(output: Output) -> @location(0) vec4f {
        return output.color;
    }

`